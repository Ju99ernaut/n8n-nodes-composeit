import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ComposeItApi implements ICredentialType {
	name = 'composeItApi';

	displayName = 'ComposeIt API';

	icon: Icon = { light: 'file:../icons/composeit.svg', dark: 'file:../icons/composeit.dark.svg' };

	documentationUrl = 'https://app.composeit.app/dashboard/api-keys';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Enter your API key with at least templates.read and documents.write permissions.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-KEY': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.composeit.app/api',
			url: '/api-keys/test',
			method: 'GET',
		},
	};
}
