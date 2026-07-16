import type { FieldType, ResourceMapperField } from 'n8n-workflow';
import type { DataSourceDefinition } from './interfaces';

export function parseDatasourcesToResourceMapperFields(
	dataSources: DataSourceDefinition[],
): ResourceMapperField[] {
	if (!Array.isArray(dataSources) || dataSources.length === 0) {
		return [];
	}

	const rootSource = dataSources.find((source) => source.isRoot === true) || dataSources[0];
	const fields: ResourceMapperField[] = [];

	const parseSource = (
		currentSource: DataSourceDefinition,
		prefix = '',
		prefixLabel = '',
		visited = new Set<string>(),
		depth = 0,
	) => {
		if (!currentSource || !currentSource.schema) {
			return;
		}

		if (visited.has(currentSource.id)) {
			return;
		}
		const newVisited = new Set(visited);
		newVisited.add(currentSource.id);

		for (const [key, property] of Object.entries(currentSource.schema)) {
			if (key === 'id') {
				continue;
			}

			const fieldPath = prefix ? `${prefix}_${property.id}` : property.id;
			const displayName = prefixLabel ? `${prefixLabel}.${key}` : key;

			if (property.type === 'relation') {
				if (depth >= 1) {
					fields.push({
						id: fieldPath,
						displayName: `${displayName} (Nested Data)`,
						required: false,
						display: true,
						defaultMatch: false,
						type: 'object',
					});
					continue;
				}
				const targetSource = dataSources.find((src) => src.id === property.target);
				if (targetSource) {
					if (property.isMany) {
						fields.push({
							id: fieldPath,
							displayName: `${displayName} (Array of Objects)`,
							required: false,
							display: true,
							defaultMatch: false,
							type: 'array',
						});
					} else {
						parseSource(targetSource, fieldPath, displayName, newVisited, depth + 1);
					}
				}
			} else {
				let fieldType: FieldType = 'string';
				if (property.type === 'number') {
					fieldType = 'number';
				} else if (property.type === 'boolean') {
					fieldType = 'boolean';
				} else if (property.type === 'date') {
					fieldType = 'dateTime';
				} else if (property.type === 'json') {
					fieldType = 'object';
				}

				fields.push({
					id: fieldPath,
					displayName,
					required: false,
					display: true,
					defaultMatch: false,
					type: fieldType,
				});
			}
		}
	};

	parseSource(rootSource);
	return fields;
}
