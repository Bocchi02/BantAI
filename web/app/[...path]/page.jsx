import { BantAIApp } from "../BantAIApp";
export default async function BantAIRoute({ params, }) {
    const { path } = await params;
    return <BantAIApp initialPath={`/${path.join("/")}`}/>;
}
