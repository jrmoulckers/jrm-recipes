import FullPageImageView from "~/server/full-image-page";
import { Modal } from "./modal";

export default async function PhotoModalPage({
  params,
}: {
  params: { id: string };
}) {
  params = await params;
  const idAsNumber = Number(params.id);
  if (Number.isNaN(idAsNumber)) throw new Error("Invalid photo ID");

  return (
    <Modal>
      <FullPageImageView id={idAsNumber} />
    </Modal>
  );
}
