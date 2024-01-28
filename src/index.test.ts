import {z} from "zod";
import {APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda';
import {extendZodWithLambdaEventMapper, extract} from "./index";

extendZodWithLambdaEventMapper(z);

describe('Zod prototypes patching', () => {
    it('Should not re-assign function in prototype if already extended', async () => {
        const before = z.ZodSchema.prototype.fromBody;
        extendZodWithLambdaEventMapper(z);
        const after = z.ZodSchema.prototype.fromBody;
        expect(after).toBe(before)
    });
})

describe('Extract fromBody, fromQuery, fromParams, fromClaims', () => {
    const eventRawData = {
        body: {
            stringValBody: 'stringValBody',
            numberValBody: 777,
            booleanValBody: true,
            objectValBody: {
                stringVal: 'stringVal',
                numberVal: 888,
                booleanVal: true,
            },
            emptyStringBody: ''
        },
        params: {
            stringValParam: 'stringValParams',
            numberValParam: String(777),
            booleanValParam: String(true),
        },
        query: {
            stringValQuery: 'stringValQuery',
            numberValQuery: String(777),
            booleanValQuery: String(true),
        },
        claims: {
            uid: '23jfdfndmfi2334'
        }
    };
    const jwtEvent = createAPIGatewayProxyEventV2WithJWTAuthorizer(eventRawData);
    const nonJwtEvent = createAPIGatewayProxyEventV2(eventRawData);
    describe('Mappings without path/name', () => {
        const schema = z.object({
            claims: z.object({
                uid: z.string()
            }).fromJwtClaims(),
            body: z.object({
                stringValBody: z.string(),
                numberValBody: z.number(),
                booleanValBody: z.boolean(),
                objectValBody: z.object({
                    stringVal: z.string(),
                    numberVal: z.number(),
                    booleanVal: z.boolean(),
                }),
                emptyStringBody: z.string()
            }).fromBody(),
            params: z.object({
                stringValParam: z.string(),
                numberValParam: z.number(),
                booleanValParam: z.boolean(),
            }).fromParams(),
            query: z.object({
                stringValQuery: z.string(),
                numberValQuery: z.number(),
                booleanValQuery: z.boolean(),
            }).fromQuery(),
        });
        it('Extract full objects without name/path specified from APIGatewayProxyEventV2WithJWTAuthorizer', async () => {
            const extracted = extract(jwtEvent, schema)
            expect(extracted).toEqual(eventRawData);
        });
        it('Extract full objects without name/path specified from APIGatewayProxyEventV2 results to claims undefined', async () => {
            const extracted = extract(nonJwtEvent, schema)
            expect(extracted).toEqual({...eventRawData, claims: undefined});
        });
        it('Extract full objects without name/path from undefined body results in undefined body', async () => {
            const extracted = extract({...jwtEvent, body: undefined}, schema)
            expect(extracted).toEqual({...eventRawData, body: undefined});
        });
    })
    describe('Mappings with path/name', () => {
        const schema = z.object({
            claims: z.object({
                uid: z.string().fromJwtClaims('uid'),
            }),
            body: z.object({
                stringValBody: z.string().fromBody('stringValBody'),
                numberValBody: z.number().fromBody('numberValBody'),
                booleanValBody: z.boolean().fromBody('booleanValBody'),
                objectValBody: z.object({
                    stringVal: z.string().fromBody('objectValBody.stringVal'),
                    numberVal: z.number().fromBody('objectValBody.numberVal'),
                    booleanVal: z.boolean().fromBody('objectValBody.booleanVal'),
                }),
                emptyStringBody: z.string().fromBody('emptyStringBody')
            }),
            params: z.object({
                stringValParam: z.string().fromParams('stringValParam'),
                numberValParam: z.number().fromParams('numberValParam'),
                booleanValParam: z.boolean().fromParams('booleanValParam'),
            }),
            query: z.object({
                stringValQuery: z.string().fromQuery('stringValQuery'),
                numberValQuery: z.number().fromQuery('numberValQuery'),
                booleanValQuery: z.boolean().fromQuery('booleanValQuery'),
            }),
        });
        it('Extract full objects with name/path specified from APIGatewayProxyEventV2WithJWTAuthorizer', async () => {
            const extracted = extract(jwtEvent, schema)
            expect(extracted).toEqual(eventRawData);
        });
        it('Extract partially objects with name/path specified from APIGatewayProxyEventV2WithJWTAuthorizer', async () => {
            const partialSchema = z.object({
                claims: z.object({
                    uid: z.string().fromJwtClaims('uid'),
                }),
                body: z.object({
                    stringValBody: z.string().fromBody('stringValBody'),
                    booleanValBody: z.boolean(),
                    objectValBody: z.object({
                        stringVal: z.string(),
                        numberVal: z.number().fromBody('objectValBody.numberVal'),
                        booleanVal: z.boolean(),
                    }),
                    emptyStringBody: z.string().fromBody('emptyStringBody')
                }),
                params: z.object({
                    stringValParam: z.string(),
                    booleanValParam: z.boolean(),
                }),
                query: z.object({
                    stringValQuery: z.string().fromQuery('stringValQuery'),
                    numberValQuery: z.number(),
                    booleanValQuery: z.boolean().fromQuery('booleanValQuery'),
                }),
            });
            const extracted = extract(jwtEvent, partialSchema)
            const partialExpectedData = {
                body: {
                    stringValBody: 'stringValBody',
                    objectValBody: {
                        numberVal: 888,
                    },
                    emptyStringBody: ''
                },
                params: {},
                query: {
                    stringValQuery: 'stringValQuery',
                    booleanValQuery: String(true),
                },
                claims: {
                    uid: '23jfdfndmfi2334'
                }
            };
            expect(extracted).toEqual(partialExpectedData);
        });
        it('Extract full objects with name/path specified from APIGatewayProxyEventV2 results to claims empty object', async () => {
            const extracted = extract(nonJwtEvent, schema)
            expect(extracted).toEqual({...eventRawData, claims: {}});
        });
        it('Extract full objects with name/path specified from undefined body results in empty nested objects', async () => {
            const extracted = extract({...jwtEvent, body: undefined}, schema)
            expect(extracted).toEqual({...eventRawData, body: {objectValBody: {}}});
        });
    })
    describe('Mixed mappings', () => {
        it('Extract different combinations for readme', async () => {
            const schema = z.object({
                order: z.object({
                    customerId: z.string().fromJwtClaims('uid'),
                    orderId: z.string().fromParams('orderId'),
                    products: z.array(z.object({
                        name: z.string(),
                        quantity: z.number(),
                    })).fromBody('products'),
                    pagination: z.object({
                        skip: z.number(),
                        take: z.number()
                    }).fromQuery()
                }),
                comment: z.string().fromBody('additionalInfo.comment'),
            });
            const event: RecursivePartial<APIGatewayProxyEventV2WithJWTAuthorizer> = {
                requestContext: {
                    authorizer: {
                        jwt: {
                            claims: {
                                uid: '12345',
                            },
                        },
                    },
                },
                body: JSON.stringify({
                    products: [
                        {
                            name: 'cucumbers',
                            quantity: 3,
                        },
                        {
                            name: 'tomatoes',
                            quantity: 2,
                        }
                    ],
                    additionalInfo: {
                        comment: 'some comment',
                        note: 'some note'
                    }
                }),
                pathParameters: {
                    orderId: '54321',
                },
                queryStringParameters:  {
                    take: '2',
                    skip: '5',
                },
            };
            const expectedObject =
            {
                order: {
                    customerId: "12345",
                    orderId: "54321",
                    products: [
                        {
                            name: "cucumbers",
                            quantity: 3,
                        },
                        {
                            name: "tomatoes",
                            quantity: 2,
                        },
                    ],
                    pagination: {
                        take: "2",
                        skip: "5",
                    },
                },
                comment: "some comment",
            };

            const extracted = extract(event as APIGatewayProxyEventV2WithJWTAuthorizer, schema)
            expect(extracted).toEqual(expectedObject);
        });
        it('Extract name + optonal description', async () => {
            const schema = z.object({
                name: z.string(),
                description: z.string().optional()
            }).fromBody();
            const event: RecursivePartial<APIGatewayProxyEventV2WithJWTAuthorizer> = {
                body: JSON.stringify({name:"some name"}),
            };
            const expectedObject =
                {name:"some name"};

            const extracted = extract(event as APIGatewayProxyEventV2WithJWTAuthorizer, schema)
            expect(extracted).toEqual(expectedObject);
        });
    })
});
export declare type EventOptions = {
    body?: {
        [name: string]: { [name: string]: string | number | boolean | string[] } | string | number | boolean | string[]
    }
    query?: { [name: string]: string | undefined };
    params?: { [name: string]: string | undefined };
    claims?: { [name: string]: string | number | boolean | string[] };
};

export function createAPIGatewayProxyEventV2WithJWTAuthorizer(
    options: EventOptions = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
    const v2event = createAPIGatewayProxyEventV2(options);
    return {
        ...v2event,
        requestContext: {
            ...v2event.requestContext,
            authorizer: {
                principalId: '123',
                integrationLatency: 10,
                jwt: {
                    claims: options.claims || {
                        claim1: 'value1',
                        claim2: 'value2',
                    },
                    scopes: ['scope1', 'scope2'],
                },
            },
        }

    };
}

export function createAPIGatewayProxyEventV2(
    options: EventOptions = {},
): APIGatewayProxyEventV2 {
    return {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/my/path',
        rawQueryString: 'parameter1=value1&parameter1=value2&parameter2=value',
        cookies: ['cookie1', 'cookie2'],
        headers: {
            header1: 'value1',
            header2: 'value1,value2',
        },
        queryStringParameters: options.query || {
            parameter1: 'value1,value2',
            parameter2: 'value',
        },
        requestContext: {
            accountId: '123456789012',
            apiId: 'api-id',
            domainName: 'id.execute-api.us-east-1.amazonaws.com',
            domainPrefix: 'id',
            http: {
                method: 'POST',
                path: '/my/path',
                protocol: 'HTTP/1.1',
                sourceIp: 'IP',
                userAgent: 'agent',
            },
            requestId: 'id',
            routeKey: '$default',
            stage: '$default',
            time: '12/Mar/2020:19:03:58 +0000',
            timeEpoch: 1583348638390,
        },
        body: options.body ? JSON.stringify(options.body) : '{}',
        pathParameters: options.params || {
            parameter1: 'value1',
        },
        isBase64Encoded: false,
        stageVariables: {
            stageVariable1: 'value1',
            stageVariable2: 'value2',
        },
    };
}

export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? RecursivePartial<U>[]
        : T[P] extends (...args: any) => any
            ? T[P] | undefined
            : T[P] extends object
                ? RecursivePartial<T[P]>
                : T[P]
}