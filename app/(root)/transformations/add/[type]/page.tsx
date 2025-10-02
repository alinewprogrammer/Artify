import Header from "@/components/shared/Header";
import TransformationForm from "@/components/shared/TransformationForm";
import { transformationTypes } from "@/constants";
import { getOrCreateUserByClerkId } from "@/lib/actions/user.actions";
import { auth } from "@clerk/nextjs/server"; // ✅ correct import
import { redirect } from "next/navigation";

const AddTransformationTypePage = async ({
  params,
}: {
  params: Promise<{ type: TransformationTypeKey }>;
}) => {
  const { type } = await params;
  const { userId } = await auth(); // ✅ must await

  if (!userId) redirect("/sign-in");

  const transformation = transformationTypes[type];
  const user = await getOrCreateUserByClerkId(userId);

  return (
    <>
      <Header 
        title={transformation.title}
        subtitle={transformation.subTitle}
      />
    
      <section className="mt-10">
        <TransformationForm 
          action="Add"
          userId={user._id}
          type={transformation.type as TransformationTypeKey}
          creditBalance={user.creditBalance}
        />
      </section>
    </>
  );
};

export default AddTransformationTypePage;
