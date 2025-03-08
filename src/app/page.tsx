import Link from "next/link";
import { db } from "~/server/db";

const mockUrls = [
  "https://uipgo5cj6i.ufs.sh/f/6k8KGzOqOGn33EWMHlAQvBcD49q0aenzP76jOuy3bWXShLJU",
  "https://uipgo5cj6i.ufs.sh/f/6k8KGzOqOGn3FYcK0SwmhvXDoLbWNFUdfkswPVQEHM4jBn9c",
  "https://uipgo5cj6i.ufs.sh/f/6k8KGzOqOGn3Kgutvy5c3726PRGkYnwb9HNAJgd0zoyFTVtI",
  "https://uipgo5cj6i.ufs.sh/f/6k8KGzOqOGn3koHoiOzQo1MF9chzUOAsBCXatrfV7dLIgjEx"
]

export default async function HomePage() {
  const posts = await db.query.posts.findMany();

  console.log(posts);

  return (
    <main className="">
      <div className="flex flex-wrap gap-4">
        {posts.map((post)=> (
          <div key={post.id} className="w-48">{post.name}</div>))}
        {[...mockUrls,...mockUrls,...mockUrls].map((url, index) => (
          <div key={index} className="w-48">
            <img src={url}/>
          </div>
        ))
        }
      </div>
      
      Hello world!
    </main>
  );
}
