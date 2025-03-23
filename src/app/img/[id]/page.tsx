import FullPageImageView from "~/server/full-image-page";

export default async function PhotoPage({ params }: { params: { id: string } }) {
  params = await params
  const idAsNumber = Number(params.id);
  if (Number.isNaN(idAsNumber)) throw new Error("Invalid photo ID");

  return <FullPageImageView id={idAsNumber} />;
}
