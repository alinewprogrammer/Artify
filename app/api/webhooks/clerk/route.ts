 
import { clerkClient, WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export async function POST(req: Request): Promise<Response> {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  // Verify the payload with the headers
  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Get the ID and type
  const { id: eventDataId } = evt.data as { id?: string };
  const eventType = evt.type;

  // CREATE
  if (eventType === "user.created") {
    const data = evt.data as { id?: string; email_addresses?: any[]; image_url?: string; first_name?: string; last_name?: string; username?: string | null };
    const clerkId: string | undefined = data?.id;
    const emailAddresses: any[] | undefined = data?.email_addresses;
    const imageUrl: string | undefined = data?.image_url;
    const firstName: string | undefined = data?.first_name;
    const lastName: string | undefined = data?.last_name;
    const username: string | null | undefined = data?.username;

    const primaryEmail: string | undefined = Array.isArray(emailAddresses)
      ? emailAddresses[0]?.email_address
      : undefined;

    if (!clerkId || !primaryEmail || !username) {
      return NextResponse.json(
        { message: "Missing required user fields" },
        { status: 400 }
      );
    }

    const user: CreateUserParams = {
      clerkId,
      email: primaryEmail,
      username,
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      photo: imageUrl ?? "",
    };

    const newUser = await createUser(user);

    // Set public metadata
    if (newUser && (newUser as any)._id) {
      const cc = await clerkClient();
      await cc.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          userId: (newUser as any)._id,
        },
      });
    }

    return NextResponse.json({ message: "OK", user: newUser });
  }

  // UPDATE
  if (eventType === "user.updated") {
    const data = evt.data as { id?: string; image_url?: string; first_name?: string; last_name?: string; username?: string | null };
    const clerkId: string | undefined = data?.id;
    const imageUrl: string | undefined = data?.image_url;
    const firstName: string | undefined = data?.first_name;
    const lastName: string | undefined = data?.last_name;
    const username: string | null | undefined = data?.username;

    if (!clerkId || !username) {
      return NextResponse.json(
        { message: "Missing user id/username for update" },
        { status: 400 }
      );
    }

    const user: UpdateUserParams = {
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      username,
      photo: imageUrl ?? "",
    };

    const updatedUser = await updateUser(clerkId, user);

    return NextResponse.json({ message: "OK", user: updatedUser });
  }

  // DELETE
  if (eventType === "user.deleted") {
    const data = evt.data as { id?: string };
    const clerkId: string | undefined = data?.id;
    if (!clerkId) {
      return NextResponse.json(
        { message: "Missing user id for delete" },
        { status: 400 }
      );
    }
    const deletedUser = await deleteUser(clerkId);
    return NextResponse.json({ message: "OK", user: deletedUser });
  }

  console.log(`Webhook with and ID of ${eventDataId} and type of ${eventType}`);
  console.log("Webhook body:", body);

  return new Response("", { status: 200 });
}