import Link from "next/link";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const images = await db.query.posts.findMany({
    orderBy: (model, { desc }) => desc(model.id),
  });

  return (
    <main className="">
      <div className="flex flex-wrap gap-4">
        {[...images,...images,...images].map((image, index) => (
          <div key={index} className="w-48">
            <img src={image.url}/>
            <div>{image.name}</div>
          </div>
        ))
        }
      </div>
      
      Hello world!
    </main>
  );
}
