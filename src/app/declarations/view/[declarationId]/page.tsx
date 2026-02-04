import { getDeclaration } from "@/lib/actions/maintenance-actions";
import { notFound } from "next/navigation";
import { DeclarationView } from "./view";

export const dynamic = 'force-dynamic';

export default async function ViewDeclarationPage({ params }: { params: { declarationId: string } }) {
    const { declarationId: declarationIdString } = await params;
    const declarationId = parseInt(declarationIdString, 10);
    if (isNaN(declarationId)) {
        notFound();
    }

    const declaration = await getDeclaration(declarationId);

    if (!declaration) {
        notFound();
    }

    return <DeclarationView declaration={declaration} />;
}
