/** A runtime binding from an entity field to a Portkey Secret Reference. */
export interface SecretMapping {
	target_field: string;
	secret_reference_id: string;
	secret_key?: string | null;
	value_format?: "json" | "string" | null;
}
