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
	type IDataObject,
	type JsonObject,
} from 'n8n-workflow';
import { parseDatasourcesToResourceMapperFields } from './helpers/utils';
import type { DataSourceDefinition } from './helpers/interfaces';

export class ComposeIt implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ComposeIt',
		name: 'composeIt',
		icon: { light: 'file:../../icons/composeit.svg', dark: 'file:../../icons/composeit.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume ComposeIt API for document generation and template management',
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
						description: 'Merge template with data and get the selected outputs',
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
					const template = await this.helpers.httpRequestWithAuthentication.call(
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
					const dataSources = template?.definition?.dataSources as DataSourceDefinition[];
					if (!dataSources || !dataSources.length) {
						return { fields: [] };
					}
					const fields = parseDatasourcesToResourceMapperFields(dataSources);
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

						const data = (this.getNodeParameter('dataFields', i) as IDataObject)
							?.value as IDataObject;
						const inputMode = this.getNodeParameter('inputMode', i) as string;

						const body: IDataObject = {
							templateId,
							formats,
							data: {
								integration: 'n8n',
								inputData: { inputMode, ...data },
							},
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
