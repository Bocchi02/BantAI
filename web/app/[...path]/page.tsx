import { BantAIApp } from "../BantAIApp";

export default async function BantAIRoute({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return <BantAIApp initialPath={`/${path.join("/")}`} />;
}
