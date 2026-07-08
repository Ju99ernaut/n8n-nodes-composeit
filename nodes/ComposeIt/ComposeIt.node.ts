import {
	NodeConnectionTypes,
	NodeApiError,
	NodeOperationError,
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
	type: string;
	target?: string;
	isMany?: boolean;
}

interface DataSourceDefinition {
	id: string;
	isRoot?: boolean;
	schema?: Record<string, PropertyDefinition>;
}

function expandDotNotation(flatObj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(flatObj)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		const parts = key.split('.');
		let current = result;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				current[part] = value;
			} else {
				if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
					current[part] = {};
				}
				current = current[part] as Record<string, unknown>;
			}
		}
	}

	return result;
}

function parseDatasourcesToResourceMapperFields(dataSources: DataSourceDefinition[]): ResourceMapperField[] {
	if (!Array.isArray(dataSources) || dataSources.length === 0) {
		return [];
	}

	const rootSource = dataSources.find((source) => source.isRoot === true) || dataSources[0];
	const fields: ResourceMapperField[] = [];

	const parseSource = (
		currentSource: DataSourceDefinition,
		prefix = '',
		visited = new Set<string>(),
		depth = 0
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

			const fieldPath = prefix ? `${prefix}.${key}` : key;
			const displayName = fieldPath;

			if (property.type === 'relation') {
				if (depth >= 4) {
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
						parseSource(targetSource, fieldPath, newVisited, depth + 1);
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
						name: 'Get',
						value: 'get',
						action: 'Get a template',
						description: 'Get a single template by ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get templates',
						description: 'Fetches a list of templates from Composeit',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a template',
						description: 'Update your template\'s properties',
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
						operation: ['get', 'update', 'generate'],
					},
				},
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['getAll'],
					},
				},
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['getAll'],
						returnAll: [false],
					},
				},
				description: 'Max number of results to return',
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
				displayName: 'Data Mode',
				name: 'dataMode',
				type: 'options',
				options: [
					{ name: 'Define Below (Resource Mapper)', value: 'defineBelow' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'json',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
					},
				},
				description: 'Whether to input template data as a JSON object or map individual fields dynamically',
			},
			{
				displayName: 'Data JSON',
				name: 'dataJson',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						resource: ['template'],
						operation: ['generate'],
						dataMode: ['json'],
					},
				},
				description: 'Data to merge with template (JSON object)',
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
						resource: ['template'],
						operation: ['generate'],
						dataMode: ['defineBelow'],
					},
				},
				description: 'Fields schema mapped to input data',
			},
		],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
					method: 'GET',
					url: 'https://app.composeit.app/api/templates',
					headers: {
						Accept: 'application/json',
					},
				});
				const templates = (responseData.data || []) as IDataObject[];
				return templates.map((t) => ({
					name: t.name as string,
					value: t.id as string,
				}));
			},
		},
		resourceMapper: {
			async getTemplateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const templateId = this.getCurrentNodeParameter('templateId') as string;
				if (!templateId) {
					return { fields: [] };
				}
				try {
					const responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
						method: 'GET',
						url: `https://app.composeit.app/templates/${templateId}`,
						headers: {
							Accept: 'application/json',
						},
					});
					const template = responseData as IDataObject;
					if (!template || !template.definition) {
						return { fields: [] };
					}
					const definition = template.definition as IDataObject;
					if (!definition.dataSources) {
						return { fields: [] };
					}
					const fields = parseDatasourcesToResourceMapperFields(definition.dataSources as DataSourceDefinition[]);
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
					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const limit = returnAll ? undefined : this.getNodeParameter('limit', i) as number;
						let responseData: IDataObject[] = [];

						if (returnAll) {
							let page = 1;
							let hasMore = true;
							while (hasMore) {
								const response = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
									method: 'GET',
									url: 'https://app.composeit.app/api/templates',
									qs: {
										page,
									},
									headers: {
										Accept: 'application/json',
									},
								});
								const pageData = (response.data || []) as IDataObject[];
								responseData.push(...pageData);
								if (pageData.length === 0) {
									hasMore = false;
								} else {
									page++;
								}
							}
						} else {
							const response = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
								method: 'GET',
								url: 'https://app.composeit.app/api/templates',
								qs: {
									page: 1,
								},
								headers: {
									Accept: 'application/json',
								},
							});
							responseData = (response.data || []) as IDataObject[];
						}

						if (limit && responseData.length > limit) {
							responseData = responseData.slice(0, limit);
						}

						const executionData = this.helpers.returnJsonArray(responseData).map(item => ({
							...item,
							pairedItem: { item: i },
						}));
						returnData.push(...executionData);
					} else if (operation === 'get') {
						const templateId = this.getNodeParameter('templateId', i) as string;
						const responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
							method: 'GET',
							url: `https://app.composeit.app/api/templates/${templateId}`,
							headers: {
								Accept: 'application/json',
							},
						});
						returnData.push({ json: responseData as IDataObject, pairedItem: { item: i } });
					} else if (operation === 'update') {
						const templateId = this.getNodeParameter('templateId', i) as string;
						const name = this.getNodeParameter('name', i) as string;
						const description = this.getNodeParameter('description', i) as string;
						const isActive = this.getNodeParameter('isActive', i) as boolean;

						const body: IDataObject = {};
						if (name !== undefined && name !== '') body.name = name;
						if (description !== undefined && description !== '') body.description = description;
						if (isActive !== undefined) body.isActive = isActive;

						const responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
							method: 'PATCH',
							url: `https://app.composeit.app/api/templates/${templateId}`,
							body,
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json',
							},
						});
						returnData.push({ json: responseData as IDataObject, pairedItem: { item: i } });
					} else if (operation === 'generate') {
						const templateId = this.getNodeParameter('templateId', i) as string;
						const templateVersion = this.getNodeParameter('templateVersion', i) as string;
						const formats = this.getNodeParameter('formats', i) as string[];
						const imageType = formats.includes('image') ? this.getNodeParameter('imageType', i) as string : undefined;
						const isTest = this.getNodeParameter('isTest', i) as boolean;
						const dataMode = this.getNodeParameter('dataMode', i) as string;

						let data: Record<string, unknown> = {};
						if (dataMode === 'json') {
							const dataJson = this.getNodeParameter('dataJson', i) as unknown;
							if (dataJson) {
								if (typeof dataJson === 'object' && dataJson !== null) {
									data = dataJson as Record<string, unknown>;
								} else if (typeof dataJson === 'string') {
									try {
										data = JSON.parse(dataJson) as Record<string, unknown>;
									} catch {
										throw new NodeOperationError(this.getNode(), 'Invalid JSON in Data JSON field', { itemIndex: i });
									}
								}
							}
						} else {
							const dataFields = this.getNodeParameter('dataFields', i) as IDataObject;
							if (dataFields && dataFields.value) {
								data = expandDotNotation(dataFields.value as Record<string, unknown>);
							}
						}

						const body: IDataObject = {
							templateId,
							formats,
							data,
						};
						if (templateVersion) body.templateVersion = templateVersion;
						if (imageType) body.imageType = imageType;
						if (isTest !== undefined) body.isTest = isTest;

						const responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'composeItApi', {
							method: 'POST',
							url: 'https://app.composeit.app/api/export',
							body,
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json',
							},
						});
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
