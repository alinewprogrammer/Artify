import { Collection } from "@/components/shared/Collection"
import { navLinks } from "@/constants"
import { getAllImages } from "@/lib/actions/image.actions"
import Image from "next/image"
import Link from "next/link"

const Home = async ({
  searchParams,
}: {
  // Next.js 15: searchParams is now a Promise
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  // Await the async searchParams before using its properties
  const sp = await searchParams;

  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const queryRaw = Array.isArray(sp.query) ? sp.query[0] : sp.query;

  const page = Number(pageRaw) || 1;
  const searchQuery = queryRaw ?? '';

  const images = await getAllImages({ page, searchQuery });

  return (
    <>
      <section className="home">
        <h1 className="home-heading">
          Unleash Your Creative Vision with Imaginify
        </h1>
        <ul className="flex-center w-full gap-20">
          {navLinks.slice(1, 5).map((link) => (
            <Link
              key={link.route}
              href={link.route}
              className="flex-center flex-col gap-2"
            >
              <li className="flex-center w-fit rounded-full bg-white p-4">
                <Image src={link.icon} alt="image" width={24} height={24} />
              </li>
              <p className="p-14-medium text-center text-white">{link.label}</p>
            </Link>
          ))}
        </ul>
      </section>

      <section className="sm:mt-12">
        <Collection 
          hasSearch={true}
          images={images?.data}
          totalPages={images?.totalPages} 
          page={page}
        />
      </section>
    </>
  );
};

export default Home;
