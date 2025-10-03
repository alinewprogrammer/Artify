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
  const escaped = q.replace(/"/g, "").replace(/\s+/g, " ").trim();
  
  // Since assets don't have tags or context metadata, we'll focus on public_id matching
  // For now, we'll return all assets in the folder and let the database handle the filtering
  // This is more reliable than trying to use Cloudinary's limited search capabilities
  return `folder="${folder}"`;
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
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    // Check if Cloudinary credentials are configured
    if (!cloudName || !apiKey || !apiSecret) {
      console.warn("Cloudinary credentials not configured. Falling back to database search only.");
      // Fall back to database search if Cloudinary is not configured
      const skipAmount = (Number(page) - 1) * limit;
      const images = await populateUser(Image.find({
        $or: [
          { title: { $regex: searchQuery, $options: 'i' } },
          { transformationType: { $regex: searchQuery, $options: 'i' } }
        ]
      }))
        .sort({ updatedAt: -1 })
        .skip(skipAmount)
        .limit(limit);

      const totalImages = await Image.find({
        $or: [
          { title: { $regex: searchQuery, $options: 'i' } },
          { transformationType: { $regex: searchQuery, $options: 'i' } }
        ]
      }).countDocuments();
      const savedImages = await Image.find().countDocuments();

      return {
        data: JSON.parse(JSON.stringify(images)),
        totalPages: Math.max(1, Math.ceil(totalImages / limit)),
        savedImages,
      };
    }
    
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
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

    // Since Cloudinary assets don't have searchable metadata (tags/context),
    // we'll do database-based search instead of Cloudinary search
    const skipAmount = (Number(page) - 1) * limit;
    
    // Create enhanced search query for database with multiple search strategies
    const sanitizedQuery = sanitizeQuery(searchQuery);
    const searchRegex = new RegExp(sanitizedQuery, 'i');
    const wordRegex = new RegExp(`\\b${sanitizedQuery}\\b`, 'i');
    
    // Handle common transformation type searches with fuzzy matching
    const transformationTypeMap: { [key: string]: string[] } = {
      'fill': ['fill', 'background'],
      'remove': ['removeBackground', 'remove', 'background removal', 'removebg'],
      'recolor': ['recolor', 'color'],
      'removebg': ['removeBackground', 'removebg', 'background', 'remove background'],
      'generative': ['generativeFill', 'generative', 'fill'],
      'restore': ['restore', 'restoration'],
      'object': ['objectRemove', 'object', 'remove'],
      'blur': ['blur', 'blurred'],
      'sharpen': ['sharpen', 'sharp'],
      'grayscale': ['grayscale', 'grey', 'gray'],
      'sepia': ['sepia', 'vintage'],
      'oil': ['oilPaint', 'oil', 'painting'],
      'cartoon': ['cartoonify', 'cartoon', 'anime'],
    };
    
    // Add transformation type variations to search
    const transformationVariations: string[] = [];
    const queryLower = sanitizedQuery.toLowerCase();
    for (const [key, variations] of Object.entries(transformationTypeMap)) {
      if (queryLower.includes(key) || variations.some(v => queryLower.includes(v))) {
        transformationVariations.push(...variations);
      }
    }
    
    // Handle common misspellings and synonyms
    const commonMisspellings: { [key: string]: string[] } = {
      'remove': ['remvoe', 'remve', 'rmove', 'remov', 'delete'],
      'background': ['bakground', 'bckground', 'backgound', 'bg'],
      'color': ['colour', 'clr', 'colr'],
      'generative': ['genrative', 'generatve', 'gen'],
      'restore': ['restor', 'restr', 'fix'],
      'blur': ['blr', 'blure'],
      'sharpen': ['sharpen', 'sharpn'],
    };
    
    const searchVariations: string[] = [];
    for (const [correct, misspellings] of Object.entries(commonMisspellings)) {
      if (queryLower.includes(correct)) {
        searchVariations.push(...misspellings);
      } else if (misspellings.some(misspelling => queryLower.includes(misspelling))) {
        searchVariations.push(correct);
      }
    }
    
    // Build comprehensive search filter
    const searchFilterConditions = [
      // Exact matches (highest priority)
      { title: wordRegex },
      { transformationType: wordRegex },
      { prompt: wordRegex },
      { aspectRatio: wordRegex },
      { color: wordRegex },
      
      // Partial matches (lower priority)
      { title: searchRegex },
      { transformationType: searchRegex },
      { prompt: searchRegex },
      { aspectRatio: searchRegex },
      { color: searchRegex },
      { publicId: searchRegex },
      
      // Author name search
      { 
        $expr: {
          $or: [
            { $regexMatch: { input: "$author.firstName", regex: searchRegex } },
            { $regexMatch: { input: "$author.lastName", regex: searchRegex } }
          ]
        }
      }
    ];
    
    // Add transformation type variations if any found
    if (transformationVariations.length > 0) {
      transformationVariations.forEach(variation => {
        searchFilterConditions.push({
          transformationType: new RegExp(variation, 'i')
        });
      });
    }
    
    // Add search variations for misspellings/synonyms
    if (searchVariations.length > 0) {
      searchVariations.forEach(variation => {
        searchFilterConditions.push(
          { title: new RegExp(variation, 'i') },
          { transformationType: new RegExp(variation, 'i') },
          { prompt: new RegExp(variation, 'i') }
        );
      });
    }
    
    const searchFilter = {
      $or: searchFilterConditions
    };

    // Get all matching images first (without pagination for scoring)
    const allMatchingImages = await populateUser(Image.find(searchFilter)).lean();
    
    // Score and sort results for better relevance
    const scoredImages = allMatchingImages.map((image: any) => {
      let score = 0;
      const query = sanitizedQuery.toLowerCase();
      
      // Title matches get highest score
      if (image.title) {
        const titleLower = image.title.toLowerCase();
        if (titleLower === query) score += 100; // Exact match
        else if (titleLower.includes(query)) score += 50; // Partial match
        else if (titleLower.split(' ').some((word: string) => word.startsWith(query))) score += 25; // Word start
      }
      
      // Transformation type matches
      if (image.transformationType) {
        const typeLower = image.transformationType.toLowerCase();
        if (typeLower === query) score += 80;
        else if (typeLower.includes(query)) score += 40;
        else if (transformationVariations.some(variation => typeLower.includes(variation.toLowerCase()))) {
          score += 35; // Fuzzy match for transformation variations
        }
      }
      
      // Prompt matches
      if (image.prompt) {
        const promptLower = image.prompt.toLowerCase();
        if (promptLower.includes(query)) score += 30;
      }
      
      // Color matches
      if (image.color) {
        const colorLower = image.color.toLowerCase();
        if (colorLower.includes(query)) score += 20;
      }
      
      // Aspect ratio matches
      if (image.aspectRatio) {
        const aspectLower = image.aspectRatio.toLowerCase();
        if (aspectLower.includes(query)) score += 15;
      }
      
      // Author name matches
      if (image.author) {
        const firstName = image.author.firstName?.toLowerCase() || '';
        const lastName = image.author.lastName?.toLowerCase() || '';
        if (firstName.includes(query) || lastName.includes(query)) score += 35;
      }
      
      return { ...image, _score: score };
    });
    
    // Sort by score (descending) then by updatedAt (descending)
    scoredImages.sort((a: any, b: any) => {
      if (b._score !== a._score) return b._score - a._score;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    
    // Apply pagination to sorted results
    const paginatedImages = scoredImages.slice(skipAmount, skipAmount + limit);
    
    // Remove score from final results
    const finalImages = paginatedImages.map(({ _score, ...image }: any) => image);
    
    const totalImages = scoredImages.length;
    const savedImages = await Image.find().countDocuments();

    return {
      data: JSON.parse(JSON.stringify(finalImages)),
      totalPages: Math.max(1, Math.ceil(totalImages / limit)),
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
