import { SignedIn, SignedOut } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { getMyImages } from "~/server/queries";

export const dynamic = "force-dynamic";

async function Images() {
  const images = await getMyImages();

  return (
    <div className="flex flex-wrap justify-center gap-4 p-4">
      {images.map((image, index) => (
        <div key={image.id} className="w-48">
          <Link href={`/img/${image?.id}`}>
            <Image
              src={image.url}
              width={192}
              height={192}
              style={{ objectFit: "contain" }}
              alt={image.name}
            />
          </Link>
          <div>{image.name}</div>
        </div>
      ))}
    </div>
  );
}

export default async function HomePage() {
  return (
    <main className="">
      <SignedOut>
        <div className="h-full w-full text-center text-2xl">
          Please sign in above
        </div>
      </SignedOut>
      <SignedIn>
        <Images />
      </SignedIn>
    </main>
  );
}
