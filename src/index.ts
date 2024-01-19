/*
Zop patching is heavily inspired by https://github.com/anatine/zod-plugins/blob/main/packages/zod-openapi/src/lib/zod-extensions.ts
 */
import get from "lodash.get";
import {AnyZodObject, z, ZodTypeAny} from "zod";
import {ZodTypeDef} from "zod";
import { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer} from "aws-lambda";

export interface LambdaEventMapperOptions {
    source: 'query' | 'body' | 'jwtClaims' | 'path',
    path?: string
}

declare module 'zod' {
    interface ZodSchema<Output = any, Def extends ZodTypeDef = ZodTypeDef, Input = Output> {
        fromBody<T extends ZodSchema<Output, Def, Input>>(
            this: T,
            path?: string
        ): T;
        fromQuery<T extends ZodSchema<Output, Def, Input>>(
            this: T,
            name?: string
        ): T;
        fromParams<T extends ZodSchema<Output, Def, Input>>(
            this: T,
            name?: string
        ): T;
        fromJwtClaims<T extends ZodSchema<Output, Def, Input>>(
            this: T,
            name?: string
        ): T;
    }
}

export function extendZodWithLambdaEventMapper(zod: typeof z) {
    if (typeof zod.ZodSchema.prototype.fromBody !== 'undefined') {
        return;
    }
    zod.ZodSchema.prototype.fromBody = function (
        path?: string
    ) {
        return extendLambdaEvent(this, {
            path,
            source: "body"
        });
    }

    zod.ZodSchema.prototype.fromQuery = function (
        name?: string
    ) {
        return extendLambdaEvent(this, {
            path: name,
            source: "query"
        });
    }

    zod.ZodSchema.prototype.fromParams = function (
        name?: string
    ) {
        return extendLambdaEvent(this, {
            path: name,
            source: "path"
        });
    }

    zod.ZodSchema.prototype.fromJwtClaims = function (
        name?: string
    ) {
        return extendLambdaEvent(this, {
            path: name,
            source: "jwtClaims"
        });
    }
}

interface ExtendedZodTypeAny extends ZodTypeAny {
    lambdaEventMapperOptions?: LambdaEventMapperOptions;
}

interface ExtendedAnyZodObject extends AnyZodObject {
    lambdaEventMapperOptions: LambdaEventMapperOptions;
}

function isLambdaEventZodAnyObject(obj: AnyZodObject): obj is ExtendedAnyZodObject {
    return (obj as ExtendedAnyZodObject).lambdaEventMapperOptions !== undefined;
}

function isAPIGatewayProxyEventV2WithJWTAuthorizer (obj: SupportedEvents): obj is APIGatewayProxyEventV2WithJWTAuthorizer {
    return (obj as APIGatewayProxyEventV2WithJWTAuthorizer)?.requestContext?.authorizer?.jwt !== undefined;
}

function extendLambdaEvent<T extends ExtendedZodTypeAny>(
    schema: T,
    options: LambdaEventMapperOptions
): T {
    schema.lambdaEventMapperOptions = Object.assign(schema.lambdaEventMapperOptions || {}, options);
    return schema;
}
export type SupportedEvents = APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithJWTAuthorizer;

export function extract<T extends SupportedEvents>(
    event: T,
    zodRef: AnyZodObject
): unknown {
    return extractObject(event, zodRef);
}
function extractObject<T extends SupportedEvents>(
    event: T,
    zodRef: AnyZodObject
): unknown {
    if (isLambdaEventZodAnyObject(zodRef)) {
        return extractSelf(event, zodRef);
    }else {
        return extractShape(event, zodRef);
    }
}
function extractSelf <T extends SupportedEvents>(event: T, zodRef: ExtendedAnyZodObject): unknown{
    switch (zodRef.lambdaEventMapperOptions.source) {
        case 'body':
            if (!event.body) {
                return undefined;
            }
            const parsedBody = JSON.parse(event.body);
            if (zodRef.lambdaEventMapperOptions.path) {
                return get(parsedBody, zodRef.lambdaEventMapperOptions.path, undefined)
            } else {
                return parsedBody;
            }
        case 'jwtClaims':
            if (isAPIGatewayProxyEventV2WithJWTAuthorizer(event)){
                if (zodRef.lambdaEventMapperOptions.path){
                    return get(event.requestContext.authorizer.jwt.claims, zodRef.lambdaEventMapperOptions.path, undefined)
                } else{
                    return event.requestContext.authorizer.jwt.claims;
                }
            }
            return undefined;
        case 'path':
            if (zodRef.lambdaEventMapperOptions.path){
                return get(event.pathParameters, zodRef.lambdaEventMapperOptions.path, undefined)
            } else{
                return event.pathParameters
            }
        case 'query':
            if (zodRef.lambdaEventMapperOptions.path){
                return get(event.queryStringParameters, zodRef.lambdaEventMapperOptions.path, undefined)
            } else{
                return event.queryStringParameters
            }
    }
}

function extractShape<T extends SupportedEvents>( event: T, zodRef: AnyZodObject,) {
    if (!zodRef.shape){
        return undefined;
    }
    const extracted: { [key: string]: unknown } = {};
    const keys = Object.keys(zodRef.shape);
    for (const key of keys) {
        let nested = extractObject(event, zodRef.shape[key])
        if (nested !== undefined) {
            extracted[key] = nested;
        }
    }
    return extracted;
}