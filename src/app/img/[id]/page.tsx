export default function PhotoModal({
  params: { id: photoId },
}: {
  params: { id: string };
}) {
  return <div>Photo ID: {photoId}</div>;
}
