export interface PropertyDefinition {
	id: string;
	type: string;
	target?: string;
	isMany?: boolean;
}

export interface DataSourceDefinition {
	id: string;
	isRoot?: boolean;
	schema?: Record<string, PropertyDefinition>;
}
