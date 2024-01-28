# @santriseus/zod-lambda-mapper

[![Coverage Status](https://coveralls.io/repos/github/santriseus/zod-lambda-mapper/badge.svg?branch=main)](https://coveralls.io/github/santriseus/zod-lambda-mapper?branch=main)

Extends a [Zod](https://github.com/colinhacks/zod) schema with additional functions allowing to declare mapping and extract required fields from AWS API Gateway Lambda Events `APIGatewayProxyEventV2`and `APIGatewayProxyEventV2WithJWTAuthorizer`

## Installation

Zod is a peer dependency.

```shell
npm install zod @santriseus/zod-lambda-mapper
```

## Usage

### Extend a Zod schema with additional methods
- `fromBody(path?: string)` (path is [lodash get](https://lodash.com/docs#get) path, if not specified whole parsed body object is assigned)
- `fromQuery(name?: string)` (name is query parameter name, if not specified whole query object is assigned)
- `fromParams(name?: string)` (name is url parameter name, if not specified whole params object is assigned)
- `fromJwtClaims(name?: string)` (name is jwt claim name, if not specified whole claims object is assigned)

```typescript
import { extendZodWithLambdaEventMapper, extract } from '@santriseus/zod-lambda-mapper';
import {z} from 'zod';

extendZodWithLambdaEventMapper(z);

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
const event: APIGatewayProxyEventV2WithJWTAuthorizer = {
//   ...  
  requestContext: {
//   ...
    authorizer: {
//   ...    
      jwt: {
        claims: {
          uid: '12345',
        },
      },
    },
  },
//   ...
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
//   ...
  pathParameters: {
    orderId: '54321',
  },
//   ...  
  queryStringParameters:  {
    take: '2',
    skip: '5',
  },
//  ...  
};

const extracted = extract(event, schema)
// ...
```

This will extract  following object:

```javascript
const extracted = {
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
  comment: "some comment"
}
```
