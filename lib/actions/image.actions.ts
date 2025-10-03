"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "../database/mongoose";
import { handleError } from "../utils";
import User from "../database/models/user.model";
import Image from "../database/models/image.model";
import { redirect } from "next/navigation";

import { v2 as cloudinary } from "cloudinary";

const populateUser = (query: any) =>
  query.populate({
    path: "author",
    model: User,
    select: "_id firstName lastName clerkId",
  });

/* ---------------------------
   Helpers: sanitize & expression
   --------------------------- */

function sanitizeQuery(raw: string | undefined, maxLen = 120) {
  if (!raw) return "";
  // Allow letters, numbers, spaces, dashes, underscores.
  // Remove quotes and special operators to avoid Cloudinary expression injection.
  const cleaned = String(raw)
    .replace(/["'`\\\/]/g, "") // strip quotes/backslashes/slashes
    .replace(/[^\w\s\-_.]/g, " ") // replace other special chars with space
    .replace(/\s+/g, " ") // collapse spaces
    .trim()
    .slice(0, maxLen);
  return cleaned;
}

/**
 * Build a safe Cloudinary search expression targeting fields we care about.
 * Example: folder="imaginify" AND (public_id:*cat* OR filename:*cat* OR tags:cat)
 */
function buildCloudinaryExpression(folder: string, q: string) {
  if (!q) return `folder="${folder}"`;
  const escaped = q.replace(/"/g, "");
  // Note: Cloudinary supports wildcard matches like public_id:*value*
  // For tags we use direct token match (tags:token). This may be adjusted to your tagging scheme.
  // Surround the query with wildcards for partial matching on filename/public_id.
  return `folder="${folder}" AND (public_id:*${escaped}* OR filename:*${escaped}* OR tags:${escaped})`;
}

/**
 * Fetch all public_id values from Cloudinary search using pagination (next_cursor).
 * Stops if next_cursor is falsy or the safety cap is reached.
 */
async function fetchAllCloudinaryPublicIds(expression: string, maxPerRequest = 100) {
  const publicIds: string[] = [];
  let nextCursor: string | undefined = undefined;
  const safetyCap = 5000; // protects against extremely large result sets; tune as needed
  let fetchedSoFar = 0;

  do {
    const res = await cloudinary.search
      .expression(expression)
      .sort_by("created_at", "desc")
      .max_results(maxPerRequest)
      .next_cursor(nextCursor)
      .execute();

    if (res && Array.isArray(res.resources) && res.resources.length > 0) {
      for (const r of res.resources) {
        if (r.public_id) publicIds.push(r.public_id);
      }
      fetchedSoFar += res.resources.length;
    }

    nextCursor = res?.next_cursor;

    // Safety break to avoid accidentally looping forever
    if (fetchedSoFar >= safetyCap) {
      break;
    }
  } while (nextCursor);

  return publicIds;
}

/* ---------------------------
   CRUD & Query functions
   --------------------------- */

// ADD IMAGE
export async function addImage({ image, userId, path }: AddImageParams) {
  try {
    await connectToDatabase();

    const author = await User.findById(userId);

    if (!author) {
      throw new Error("User not found");
    }

    const newImage = await Image.create({
      ...image,
      author: author._id,
    });

    revalidatePath(path);

    return JSON.parse(JSON.stringify(newImage));
  } catch (error) {
    handleError(error);
  }
}

// UPDATE IMAGE
export async function updateImage({ image, userId, path }: UpdateImageParams) {
  try {
    await connectToDatabase();

    const imageToUpdate = await Image.findById(image._id);

    if (!imageToUpdate || imageToUpdate.author.toHexString() !== userId) {
      throw new Error("Unauthorized or image not found");
    }

    const updatedImage = await Image.findByIdAndUpdate(imageToUpdate._id, image, { new: true });

    revalidatePath(path);

    return JSON.parse(JSON.stringify(updatedImage));
  } catch (error) {
    handleError(error);
  }
}

// DELETE IMAGE
export async function deleteImage(imageId: string) {
  try {
    await connectToDatabase();

    await Image.findByIdAndDelete(imageId);
  } catch (error) {
    handleError(error);
  } finally {
    redirect("/");
  }
}

// GET IMAGE
export async function getImageById(imageId: string) {
  try {
    await connectToDatabase();

    const image = await populateUser(Image.findById(imageId));

    if (!image) throw new Error("Image not found");

    return JSON.parse(JSON.stringify(image));
  } catch (error) {
    handleError(error);
  }
}

/**
 * GET IMAGES (supports optional Cloudinary-based search)
 * - Returns { data, totalPages, savedImages }
 */
export async function getAllImages({
  limit = 9,
  page = 1,
  searchQuery = "",
}: {
  limit?: number;
  page: number;
  searchQuery?: string;
}) {
  try {
    await connectToDatabase();

    // configure Cloudinary (safe to call; it's idempotent)
    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    // If no searchQuery, just return paginated DB results.
    if (!searchQuery) {
      const skipAmount = (Number(page) - 1) * limit;

      const images = await populateUser(Image.find({}))
        .sort({ updatedAt: -1 })
        .skip(skipAmount)
        .limit(limit);

      const totalImages = await Image.find().countDocuments();
      const savedImages = totalImages;

      return {
        data: JSON.parse(JSON.stringify(images)),
        totalPages: Math.max(1, Math.ceil(totalImages / limit)),
        savedImages,
      };
    }

    // Sanitize and build expression
    const sanitized = sanitizeQuery(searchQuery);
    const expression = buildCloudinaryExpression("imaginify", sanitized);

    // Fetch public_ids from Cloudinary (with pagination)
    let resourceIds: string[] = [];
    try {
      resourceIds = await fetchAllCloudinaryPublicIds(expression, 100);
    } catch (err) {
      // Cloudinary error - surface friendly error and return empty result set
      console.error("Cloudinary search failed:", err);
      // Optionally throw to be handled upstream; for UX we return empty results
      return {
        data: [],
        totalPages: 1,
        savedImages: await Image.find().countDocuments(),
      };
    }

    // If Cloudinary returned nothing, return empty paginated response
    if (!resourceIds || resourceIds.length === 0) {
      return {
        data: [],
        totalPages: 1,
        savedImages: await Image.find().countDocuments(),
      };
    }

    // Compute pagination over resourceIds, then fetch only the page's IDs from Mongo
    const total = resourceIds.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (Number(page) - 1) * limit;
    const pageIds = resourceIds.slice(start, start + limit);

    // Fetch corresponding DB documents and preserve order from pageIds
    const imagesFromDB = await populateUser(Image.find({ publicId: { $in: pageIds } }))
      .lean()
      .then((rows: any[]) => {
        const map = new Map(rows.map((r) => [r.publicId, r]));
        return pageIds.map((id) => map.get(id)).filter(Boolean);
      });

    const savedImages = await Image.find().countDocuments();

    return {
      data: JSON.parse(JSON.stringify(imagesFromDB)),
      totalPages,
      savedImages,
    };
  } catch (error) {
    handleError(error);
  }
}

// GET IMAGES BY USER
export async function getUserImages({
  limit = 9,
  page = 1,
  userId,
}: {
  limit?: number;
  page: number;
  userId: string;
}) {
  try {
    await connectToDatabase();

    const skipAmount = (Number(page) - 1) * limit;

    const images = await populateUser(Image.find({ author: userId }))
      .sort({ updatedAt: -1 })
      .skip(skipAmount)
      .limit(limit);

    const totalImages = await Image.find({ author: userId }).countDocuments();

    return {
      data: JSON.parse(JSON.stringify(images)),
      totalPages: Math.max(1, Math.ceil(totalImages / limit)),
    };
  } catch (error) {
    handleError(error);
  }
}
