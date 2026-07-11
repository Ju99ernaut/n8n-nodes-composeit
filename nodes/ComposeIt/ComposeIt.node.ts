import {
	NodeConnectionTypes,
	NodeApiError,
	type INodeType,
	type INodeTypeDescription,
	type IExecuteFunctions,
	type INodeExecutionData,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type ResourceMapperFields,
	type ResourceMapperField,
	type FieldType,
	type IDataObject,
	type JsonObject,
} from 'n8n-workflow';

interface PropertyDefinition {
	id: string;
	type: string;
	target?: string;
	isMany?: boolean;
}

interface DataSourceDefinition {
	id: string;
	isRoot?: boolean;
	schema?: Record<string, PropertyDefinition>;
}

function parseDatasourcesToResourceMapperFields(
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

export class ComposeIt implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComposeIt',
		name: 'composeIt',
		icon: { light: 'file:../../icons/composeit.svg', dark: 'file:../../icons/composeit.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume ComposeIt API for document and template management',
		defaults: {
			name: 'ComposeIt',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'composeItApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Template',
						value: 'template',
					},
				],
				default: 'template',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['template'],
					},
				},
				options: [
					{
						name: 'Generate',
						value: 'generate',
						action: 'Generate a document',
						description: 'Merge template with data and get the specified outputs',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a template',
						description: "Update your template's properties",
					},
				],
				default: 'generate',
			},
			{
				displayName: 'Template Name or ID',
				name: 'templateId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['update', 'generate'],
					},
				},
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['update'],
					},
				},
				description: 'Update template name',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['update'],
					},
				},
				description: 'Update template description',
			},
			{
				displayName: 'Is Published',
				name: 'isActive',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['update'],
					},
				},
				description: 'Whether the templates are published to generate without watermark',
			},
			{
				displayName: 'Template Version',
				name: 'templateVersion',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
					},
				},
				description: 'Specific version of a template to use',
			},
			{
				displayName: 'Formats',
				name: 'formats',
				type: 'multiOptions',
				options: [
					{ name: 'HTML', value: 'html' },
					{ name: 'Image', value: 'image' },
					{ name: 'MJML', value: 'mjml' },
					{ name: 'PDF', value: 'pdf' },
				],
				required: true,
				default: [],
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
					},
				},
				description: 'Formats to get after merging',
			},
			{
				displayName: 'Image Type',
				name: 'imageType',
				type: 'options',
				options: [
					{ name: 'JPG', value: 'jpg' },
					{ name: 'PNG', value: 'png' },
				],
				default: 'png',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
						formats: ['image'],
					},
				},
				description: 'Format of the image output',
			},
			{
				displayName: 'Test',
				name: 'isTest',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
					},
				},
				description: 'Whether to get test generation with watermark',
			},
			{
				displayName: 'Data Input Mode',
				name: 'inputMode',
				type: 'options',
				options: [
					{ name: 'Form Builder (Simple)', value: 'form' },
					{ name: 'Raw JSON (Advanced)', value: 'json' },
				],
				default: 'form',
				description: 'Choose how you want to input variables into your template',
			},
			{
				displayName: 'JSON Data',
				name: 'jsonData',
				type: 'json',
				displayOptions: {
					show: { inputMode: ['json'], resource: ['template'], operation: ['generate'] },
				},
				default: '{}',
				description: 'Provide a structured nested object or map variables directly as JSON',
			},
			{
				displayName: 'Data Fields',
				name: 'dataFields',
				type: 'resourceMapper',
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['templateId'],
					resourceMapper: {
						resourceMapperMethod: 'getTemplateFields',
						hideNoDataError: true,
						addAllFields: false,
						supportAutoMap: false,
						mode: 'add',
						fieldWords: {
							singular: 'field',
							plural: 'fields',
						},
					},
				},
				displayOptions: {
					show: {
						inputMode: ['form'],
						resource: ['template'],
						operation: ['generate'],
					},
				},
				description: 'Fields schema mapped to input data',
			},
		],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'composeItApi',
					{
						method: 'GET',
						url: 'https://app.composeit.app/api/templates',
						qs: {
							page: 1,
							pageSize: 100,
						},
						headers: {
							Accept: 'application/json',
						},
					},
				);
				const templates = (responseData.data || []) as IDataObject[];
				return templates.map((t) => ({
					name: t.name as string,
					value: t.id as string,
				}));
			},
		},
		resourceMapping: {
			async getTemplateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const templateId = this.getCurrentNodeParameter('templateId') as string;
				if (!templateId) {
					return { fields: [] };
				}
				try {
					const responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'composeItApi',
						{
							method: 'GET',
							url: `https://app.composeit.app/api/templates/${templateId}`,
							headers: {
								Accept: 'application/json',
							},
						},
					);
					const template = responseData as IDataObject;
					if (!template || !template.definition) {
						return { fields: [] };
					}
					const definition = template.definition as IDataObject;
					if (!definition.dataSources) {
						return { fields: [] };
					}
					const fields = parseDatasourcesToResourceMapperFields(
						definition.dataSources as DataSourceDefinition[],
					);
					return { fields };
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'template') {
					if (operation === 'update') {
						const templateId = this.getNodeParameter('templateId', i) as string;
						const name = this.getNodeParameter('name', i) as string;
						const description = this.getNodeParameter('description', i) as string;
						const isActive = this.getNodeParameter('isActive', i) as boolean;

						const body: IDataObject = {};
						if (name !== undefined && name !== '') body.name = name;
						if (description !== undefined && description !== '') body.description = description;
						if (isActive !== undefined) body.isActive = isActive;

						const responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'composeItApi',
							{
								method: 'PATCH',
								url: `https://app.composeit.app/api/templates/${templateId}`,
								body,
								headers: {
									'Content-Type': 'application/json',
									Accept: 'application/json',
								},
							},
						);
						returnData.push({ json: responseData as IDataObject, pairedItem: { item: i } });
					} else if (operation === 'generate') {
						const templateId = this.getNodeParameter('templateId', i) as string;
						const templateVersion = this.getNodeParameter('templateVersion', i) as string;
						const formats = this.getNodeParameter('formats', i) as string[];
						const imageType = formats.includes('image')
							? (this.getNodeParameter('imageType', i) as string)
							: undefined;
						const isTest = this.getNodeParameter('isTest', i) as boolean;

						const data = this.getNodeParameter('dataFields', i) as IDataObject;

						const body: IDataObject = {
							templateId,
							formats,
							data,
						};
						if (templateVersion) body.templateVersion = templateVersion;
						if (imageType) body.imageType = imageType;
						if (isTest !== undefined) body.isTest = isTest;

						const responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'composeItApi',
							{
								method: 'POST',
								url: 'https://app.composeit.app/api/export',
								body,
								headers: {
									'Content-Type': 'application/json',
									Accept: 'application/json',
								},
							},
						);
						returnData.push({ json: responseData as IDataObject, pairedItem: { item: i } });
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
			}
		}
		return [returnData];
	}
}
