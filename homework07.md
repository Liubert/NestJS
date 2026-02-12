# Homework 7 — GraphQL Orders + DataLoader

## Which schema approach did you choose (code-first or schema-first) and why?

I chose **Code First**. The project is a **NestJS monolith**, so it’s convenient to keep the schema close to the models and services using decorators. This reduces duplication and makes maintenance easier. For a **microservices** architecture, I would lean more toward **Schema First**, because the contract between services is easier (in my opinion) to version and share as a `.graphql` schema.

---

## 4.1 Detecting N+1 (how did you confirm it existed before DataLoader?)

I confirmed the **N+1 problem** by enabling **SQL logging** in TypeORM and running a GraphQL query that fetches `orders → items → product`. In the logs, I could see that each `OrderItem.product` resolution triggered a separate query to `products`.

This was expected because, before DataLoader, the product was fetched one-by-one using an existing service method from a previous homework (e.g., `findOne / findById`), which executes a `SELECT` by a single `id`. As a result, resolving `product` for each item repeated the same “find one product” query many times.

---

## 4.3 Proof that N+1 is gone (before/after + what changed)

### Before
Classic **N+1**: the number of product queries matched the number of products in the response.  
If the query returned many orders with many items, the server executed a separate `SELECT` for each product.

### After
With **DataLoader**, all `productId` values are collected within the same GraphQL request and fetched using a single batched query:

- `query: SELECT "ProductEntity"."id" AS "ProductEntity_id",
"ProductEntity"."name" AS "ProductEntity_name",
"ProductEntity"."price" AS "ProductEntity_price",
"ProductEntity"."stock" AS "ProductEntity_stock",
"ProductEntity"."is_active" AS "ProductEntity_is_active",
"ProductEntity"."created_at" AS "ProductEntity_created_at"
FROM "products" "ProductEntity"
WHERE (("ProductEntity"."id" IN ($1, $2)))
-- PARAMETERS: ["8e2c94bd-d707-4850-8daf-33ed2868c7be","e658bfdb-8a51-46d7-9935-7f135fcf0e2c"]`

So instead of **N queries** for products, we run **1 batched query**, regardless of how many products are requested.


## How is the schema implemented?

The schema is implemented using the **Code First** approach. GraphQL types, inputs, and enums are defined with decorators (`@ObjectType`, `@InputType`, `@Field`, etc.), and NestJS automatically generates the `schema.gql` file.

---

## How are resolvers implemented?

Resolvers are thin and act as a transport layer. They receive arguments and delegate all business logic to the service layer. No business logic is implemented inside GraphQL resolvers.

---

## How is DataLoader implemented?

A DataLoader is implemented for **Product**. It collects all `productId` values within a single GraphQL request and executes one batched query using `WHERE id IN (...)`. This removes the N+1 problem by replacing multiple single queries with one batched query.


## Why were two different pagination strategies used (orders: offset, products: cursor)?

Two pagination strategies were implemented.

For **orders**, offset-based pagination (`limit + offset`) is used because this type of data is typically displayed in tables and is limited in size. Offset pagination is simple and more familiar for this scenario.

For **products**, cursor-based (keyset) pagination is used because products are more likely to be displayed with infinite scroll. Cursor pagination is more stable and avoids duplication issues when data changes.

## Example GraphQL Query for Testing

```graphql
query Orders {
  orders(
    filter: { dateFrom: "2022-02-01", status: CREATED }
    pagination: { limit: 10, offset: 0 }
  ) {
    id
    status
    createdAt
    items {
      quantity
      product {
        id
        name
        price
      }
    }
  }
}

  productsInfinite(limit: 50) {
    items {
      id
      name
      price
      createdAt
      isActive
    }
     nextCursor {
      id
      createdAt
    }
  }
```

## Error Handling

- **Invalid input (filter/pagination)**: handled via GraphQL + `ValidationPipe` / `class-validator` and returned as a validation error.
- **Nothing found**: `orders` returns an empty list (`[]`) instead of throwing an exception.
- **Internal errors**: returned as a standard GraphQL error with a generic message. Error details are logged by the NestJS default logger.
