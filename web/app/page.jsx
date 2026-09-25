import { connection } from "next/server";
import { SignalamApp } from "./SignalamApp";
export default async function Home() {
    await connection();
    return <SignalamApp initialPath="/"/>;
}
