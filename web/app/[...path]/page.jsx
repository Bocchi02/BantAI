import { SignalamApp } from "../SignalamApp";
export default async function SignalamRoute({ params, }) {
    const { path } = await params;
    return <SignalamApp initialPath={`/${path.join("/")}`}/>;
}
