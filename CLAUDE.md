# Development Guidelines for Claude Code

## Core Philosophy

**TEST-DRIVEN DEVELOPMENT IS NON-NEGOTIABLE.** Every single line of production code must be written in response to a failing test. No exceptions. This is not a suggestion or a preference - it is the fundamental practice that enables all other principles in this document.

Follow Test-Driven Development (TDD) with a strong emphasis on behavior-driven testing and functional programming principles.
All work should be done in small, incremental changes that maintain a working state throughout development.

## Quick Reference

**Key Principles:**

- Write tests first (TDD)
- Test behavior, not implementation
- No `any` types or type assertions
- Immutable data only
- Small, pure functions
- TypeScript strict mode always
- Use real schemas/types in tests, never redefine them
- All code must pass Biome linting before commit

**Preferred Tools:**

- **Language**: TypeScript (strict mode)
- **Testing**: Jest/Vitest + React Testing Library
- **State Management**: Prefer immutable patterns
- **Linting**: Biome (latest version)

## Testing Principles

### Behavior-Driven Testing

- **No "unit tests"** - this term is not helpful. Tests should verify expected behavior, treating implementation as a black box
- Test through the public API exclusively - internals should be invisible to tests
- No 1:1 mapping between test files and implementation files
- Tests that examine internal implementation details are wasteful and should be avoided
- **Coverage targets**: 100% coverage should be expected at all times, but these tests must ALWAYS be based on business behaviour, not implementation details
- Tests must document expected business behaviour

### Testing Tools

- **Vitest** is the test runner (configured in `vitest.config.mts`)
- **React Testing Library** + `@testing-library/user-event` for React components
- **jsdom** is the default environment; server-side code opts out per file (see below)
- All test code must follow the same TypeScript strict mode rules as production code

**Commands:**

```bash
pnpm test           # single run
pnpm test:watch     # watch mode
pnpm test:coverage  # v8 coverage report (text + html in coverage/)
pnpm typecheck      # tsc --noEmit
```

`pnpm pre-commit` runs `biome check --write && typecheck && test && build`.

### Test Environments

`vitest.config.mts` sets `environment: 'jsdom'` globally so component tests work with
no per-file ceremony. Tests for server-side modules (API route handlers, `lib/*`) declare
the node environment with a docblock on the first line:

```typescript
// @vitest-environment node
```

`vitest.setup.ts` handles three things: it registers `@testing-library/jest-dom`
matchers, shims `window.matchMedia` (jsdom does not implement it, and
`ThemeProvider` reads `prefers-color-scheme`), and after each browser-environment test
unmounts components, clears `localStorage`, and resets `document.documentElement`
classes. Tests that need a specific media-query result stub `matchMedia` themselves with
`vi.spyOn` — `restoreMocks: true` puts the shim back afterwards.

Path aliases (`@/*`) resolve through Vite's native `resolve.tsconfigPaths`, which reads
`tsconfig.json` directly — do not add `vite-tsconfig-paths`, it is redundant on Vite 7+.

### Test Organization

Tests live beside the code they exercise, named `*.test.ts` / `*.test.tsx`:

```
components/
  theme-toggle.tsx
  theme-toggle.test.tsx
lib/
  auth.ts
  auth.test.ts
```

Import test globals explicitly (`import { describe, expect, it } from 'vitest'`) rather
than enabling `globals: true` — this keeps the type augmentation working without extra
`tsconfig.json` entries.

## Code Quality Standards

### Biome Linting

**CRITICAL**: All code must pass Biome linting before committing. This is non-negotiable for company repository standards.

- **Version**: Use latest version of Biome (currently 2.5.9)
- **Installation**: Biome is available globally via Brew, but project should have local dependency
- **Usage**: Run `biome check` and `biome check --write` to auto-fix issues
- **Configuration**: `biome.json`, keyed to the installed version's `$schema`. After a Biome
  upgrade run `biome migrate --write` — 2.5 renamed `linter.rules.recommended` to
  `linter.rules.preset`, and future majors will drop the old spelling
- **Integration**: Must be run after every code change before commit

Biome is the **only** linter. ESLint and `eslint-config-next` were removed in August 2026:
Next.js 16 dropped the `next lint` command that the old `lint` script called, and keeping a
second linter alongside Biome bought nothing. `pnpm lint` now runs `biome check`.

**Required Commands:**
```bash
# Check for linting errors
biome check

# Auto-fix linting errors where possible  
biome check --write

# Format code according to Biome standards
biome format --write
```

**Workflow Integration:**
- Run Biome checks after every significant code change
- Fix all Biome errors before committing
- Use `biome check --write` for auto-fixes
- Manually resolve any remaining linting issues
- Biome errors will block company repository commits

## TypeScript Guidelines

### Strict Mode Requirements

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- **No `any`** - ever. Use `unknown` if type is truly unknown - Vercel will not accept code with the any type, so this is critical
- **No type assertions** (`as SomeType`) unless absolutely necessary with clear justification
- **No `@ts-ignore`** or `@ts-expect-error` without explicit explanation
- These rules apply to test code as well as production code

### Type Definitions

- **Prefer `type` over `interface`** in all cases
- Use explicit typing where it aids clarity, but leverage inference where appropriate
- Utilize utility types effectively (`Pick`, `Omit`, `Partial`, `Required`, etc.)
- Create domain-specific types (e.g., `UserId`, `PaymentId`) for type safety

#### Schema Usage in Tests

**CRITICAL**: Tests must use real schemas and types from the main project, not redefine their own.

**Why this matters:**

- **Type Safety**: Ensures tests use the same types as production code
- **Consistency**: Changes to schemas automatically propagate to tests
- **Maintainability**: Single source of truth for data structures
- **Prevents Drift**: Tests can't accidentally diverge from real schemas

**Implementation:**

- All domain schemas should be exported from a shared schema package or module
- Test files should import schemas from the shared location
- If a schema isn't exported yet, add it to the exports rather than duplicating it
- Mock data factories should use the real types derived from real schemas

## Code Style

### Functional Programming

I follow a "functional light" approach:

- **No data mutation** - work with immutable data structures
- **Pure functions** wherever possible
- **Composition** as the primary mechanism for code reuse
- Avoid heavy FP abstractions (no need for complex monads or pipe/compose patterns)
- Use array methods (`map`, `filter`, `reduce`) over imperative loops when possible

### Code Structure

- **No nested if/else statements** - use early returns, guard clauses, or composition
- **Avoid deep nesting** in general (max 2 levels)
- Keep functions small and focused on a single responsibility
- Prefer flat, readable code over clever abstractions

### Naming Conventions

- **Functions**: `camelCase`, verb-based (e.g., `calculateTotal`, `validatePayment`)
- **Types**: `PascalCase` (e.g., `PaymentRequest`, `UserProfile`)
- **Constants**: `UPPER_SNAKE_CASE` for true constants, `camelCase` for configuration
- **Files**: `kebab-case.ts` for all TypeScript files
- **Test files**: `*.test.ts` or `*.spec.ts`

### Comments
- Use comments judiciously
- Code should generally be self-documenting through clear naming and structure

```typescript
// Avoid: Comments explaining what the code does
const calculateDiscount = (price: number, customer: Customer): number => {
  // Check if customer is premium
  if (customer.tier === "premium") {
    // Apply 20% discount for premium customers
    return price * 0.8;
  }
  // Regular customers get 10% discount
  return price * 0.9;
};

// Good: Self-documenting code with clear names
const PREMIUM_DISCOUNT_MULTIPLIER = 0.8;
const STANDARD_DISCOUNT_MULTIPLIER = 0.9;

const isPremiumCustomer = (customer: Customer): boolean => {
  return customer.tier === "premium";
};

const calculateDiscount = (price: number, customer: Customer): number => {
  const discountMultiplier = isPremiumCustomer(customer)
    ? PREMIUM_DISCOUNT_MULTIPLIER
    : STANDARD_DISCOUNT_MULTIPLIER;

  return price * discountMultiplier;
};

// Avoid: Complex logic with comments
const processPayment = (payment: Payment): ProcessedPayment => {
  // First validate the payment
  if (!validatePayment(payment)) {
    throw new Error("Invalid payment");
  }

  // Check if we need to apply 3D secure
  if (payment.amount > 100 && payment.card.type === "credit") {
    // Apply 3D secure for credit cards over £100
    const securePayment = apply3DSecure(payment);
    // Process the secure payment
    return executePayment(securePayment);
  }

  // Process the payment
  return executePayment(payment);
};

// Good: Extract to well-named functions
const requires3DSecure = (payment: Payment): boolean => {
  const SECURE_PAYMENT_THRESHOLD = 100;
  return (
    payment.amount > SECURE_PAYMENT_THRESHOLD && payment.card.type === "credit"
  );
};

const processPayment = (payment: Payment): ProcessedPayment => {
  if (!validatePayment(payment)) {
    throw new PaymentValidationError("Invalid payment");
  }

  const securedPayment = requires3DSecure(payment)
    ? apply3DSecure(payment)
    : payment;

  return executePayment(securedPayment);
};
```

**Exception**: JSDoc comments for public APIs are acceptable when generating documentation, but the code should still be self-explanatory without them.

### Prefer Options Objects

Use options objects for function parameters as the default pattern. Only use positional parameters when there's a clear, compelling reason (e.g., single-parameter pure functions, well-established conventions like `map(item => item.value)`).

```typescript
// Avoid: Multiple positional parameters
const createPayment = (
  amount: number,
  currency: string,
  cardId: string,
  customerId: string,
  description?: string,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string
): Payment => {
  // implementation
};

// Calling it is unclear
const payment = createPayment(
  100,
  "GBP",
  "card_123",
  "cust_456",
  undefined,
  { orderId: "order_789" },
  "key_123"
);

// Good: Options object with clear property names
type CreatePaymentOptions = {
  amount: number;
  currency: string;
  cardId: string;
  customerId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

const createPayment = (options: CreatePaymentOptions): Payment => {
  const {
    amount,
    currency,
    cardId,
    customerId,
    description,
    metadata,
    idempotencyKey,
  } = options;

  // implementation
};

// Clear and readable at call site
const payment = createPayment({
  amount: 100,
  currency: "GBP",
  cardId: "card_123",
  customerId: "cust_456",
  metadata: { orderId: "order_789" },
  idempotencyKey: "key_123",
});

// Avoid: Boolean flags as parameters
const fetchCustomers = (
  includeInactive: boolean,
  includePending: boolean,
  includeDeleted: boolean,
  sortByDate: boolean
): Customer[] => {
  // implementation
};

// Confusing at call site
const customers = fetchCustomers(true, false, false, true);

// Good: Options object with clear intent
type FetchCustomersOptions = {
  includeInactive?: boolean;
  includePending?: boolean;
  includeDeleted?: boolean;
  sortBy?: "date" | "name" | "value";
};

const fetchCustomers = (options: FetchCustomersOptions = {}): Customer[] => {
  const {
    includeInactive = false,
    includePending = false,
    includeDeleted = false,
    sortBy = "name",
  } = options;

  // implementation
};

// Self-documenting at call site
const customers = fetchCustomers({
  includeInactive: true,
  sortBy: "date",
});

// Good: Configuration objects for complex operations
type ProcessOrderOptions = {
  order: Order;
  shipping: {
    method: "standard" | "express" | "overnight";
    address: Address;
  };
  payment: {
    method: PaymentMethod;
    saveForFuture?: boolean;
  };
  promotions?: {
    codes?: string[];
    autoApply?: boolean;
  };
};

const processOrder = (options: ProcessOrderOptions): ProcessedOrder => {
  const { order, shipping, payment, promotions = {} } = options;

  // Clear access to nested options
  const orderWithPromotions = promotions.autoApply
    ? applyAvailablePromotions(order)
    : order;

  return executeOrder({
    ...orderWithPromotions,
    shippingMethod: shipping.method,
    paymentMethod: payment.method,
  });
};

// Acceptable: Single parameter for simple transforms
const double = (n: number): number => n * 2;
const getName = (user: User): string => user.name;

// Acceptable: Well-established patterns
const numbers = [1, 2, 3];
const doubled = numbers.map((n) => n * 2);
const users = fetchUsers();
const names = users.map((user) => user.name);
```

**Guidelines for options objects:**

- Default to options objects unless there's a specific reason not to
- Always use for functions with optional parameters
- Destructure options at the start of the function for clarity
- Provide sensible defaults using destructuring
- Keep related options grouped (e.g., all shipping options together)
- Consider breaking very large options objects into nested groups

**When positional parameters are acceptable:**

- Single-parameter pure functions
- Well-established functional patterns (map, filter, reduce callbacks)
- Mathematical operations where order is conventional

## Development Workflow

### TDD Process - THE FUNDAMENTAL PRACTICE

**CRITICAL**: TDD is not optional. Every feature, every bug fix, every change MUST follow this process:

Follow Red-Green-Refactor strictly:

1. **Red**: Write a failing test for the desired behavior. NO PRODUCTION CODE until you have a failing test.
2. **Green**: Write the MINIMUM code to make the test pass. Resist the urge to write more than needed.
3. **Refactor**: Assess the code for improvement opportunities. If refactoring would add value, clean up the code while keeping tests green. If the code is already clean and expressive, move on.

**Common TDD Violations to Avoid:**

- Writing production code without a failing test first
- Writing multiple tests before making the first one pass
- Writing more production code than needed to pass the current test
- Skipping the refactor assessment step when code could be improved
- Adding functionality "while you're there" without a test driving it

**Remember**: If you're typing production code and there isn't a failing test demanding that code, you're not doing TDD.

#### TDD Example Workflow

```typescript
// Step 1: Red - Start with the simplest behavior
describe("Order processing", () => {
  it("should calculate total with shipping cost", () => {
    const order = createOrder({
      items: [{ price: 30, quantity: 1 }],
      shippingCost: 5.99,
    });

    const processed = processOrder(order);

    expect(processed.total).toBe(35.99);
    expect(processed.shippingCost).toBe(5.99);
  });
});

// Step 2: Green - Minimal implementation
const processOrder = (order: Order): ProcessedOrder => {
  const itemsTotal = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return {
    ...order,
    shippingCost: order.shippingCost,
    total: itemsTotal + order.shippingCost,
  };
};

// Step 3: Red - Add test for free shipping behavior
describe("Order processing", () => {
  it("should calculate total with shipping cost", () => {
    // ... existing test
  });

  it("should apply free shipping for orders over £50", () => {
    const order = createOrder({
      items: [{ price: 60, quantity: 1 }],
      shippingCost: 5.99,
    });

    const processed = processOrder(order);

    expect(processed.shippingCost).toBe(0);
    expect(processed.total).toBe(60);
  });
});

// Step 4: Green - NOW we can add the conditional because both paths are tested
const processOrder = (order: Order): ProcessedOrder => {
  const itemsTotal = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const shippingCost = itemsTotal > 50 ? 0 : order.shippingCost;

  return {
    ...order,
    shippingCost,
    total: itemsTotal + shippingCost,
  };
};

// Step 5: Add edge case tests to ensure 100% behavior coverage
describe("Order processing", () => {
  // ... existing tests

  it("should charge shipping for orders exactly at £50", () => {
    const order = createOrder({
      items: [{ price: 50, quantity: 1 }],
      shippingCost: 5.99,
    });

    const processed = processOrder(order);

    expect(processed.shippingCost).toBe(5.99);
    expect(processed.total).toBe(55.99);
  });
});

// Step 6: Refactor - Extract constants and improve readability
const FREE_SHIPPING_THRESHOLD = 50;

const calculateItemsTotal = (items: OrderItem[]): number => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};

const qualifiesForFreeShipping = (itemsTotal: number): boolean => {
  return itemsTotal > FREE_SHIPPING_THRESHOLD;
};

const processOrder = (order: Order): ProcessedOrder => {
  const itemsTotal = calculateItemsTotal(order.items);
  const shippingCost = qualifiesForFreeShipping(itemsTotal)
    ? 0
    : order.shippingCost;

  return {
    ...order,
    shippingCost,
    total: itemsTotal + shippingCost,
  };
};
```

### Refactoring - The Critical Third Step

Evaluating refactoring opportunities is not optional - it's the third step in the TDD cycle. After achieving a green state and committing your work, you MUST assess whether the code can be improved. However, only refactor if there's clear value - if the code is already clean and expresses intent well, move on to the next test.

#### What is Refactoring?

Refactoring means changing the internal structure of code without changing its external behavior. The public API remains unchanged, all tests continue to pass, but the code becomes cleaner, more maintainable, or more efficient. Remember: only refactor when it genuinely improves the code - not all code needs refactoring.

#### When to Refactor

- **Always assess after green**: Once tests pass, before moving to the next test, evaluate if refactoring would add value
- **When you see duplication**: But understand what duplication really means (see DRY below)
- **When names could be clearer**: Variable names, function names, or type names that don't clearly express intent
- **When structure could be simpler**: Complex conditional logic, deeply nested code, or long functions
- **When patterns emerge**: After implementing several similar features, useful abstractions may become apparent

**Remember**: Not all code needs refactoring. If the code is already clean, expressive, and well-structured, commit and move on. Refactoring should improve the code - don't change things just for the sake of change.

#### Refactoring Guidelines

##### 1. Commit Before Refactoring

Always commit your working code before starting any refactoring. This gives you a safe point to return to:

```bash
git add .
git commit -m "feat: add payment validation"
# Now safe to refactor
```

##### 2. Look for Useful Abstractions Based on Semantic Meaning

Create abstractions only when code shares the same semantic meaning and purpose. Don't abstract based on structural similarity alone - **duplicate code is far cheaper than the wrong abstraction**.

```typescript
// Similar structure, DIFFERENT semantic meaning - DO NOT ABSTRACT
const validatePaymentAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 10000;
};

const validateTransferAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 10000;
};

// These might have the same structure today, but they represent different
// business concepts that will likely evolve independently.
// Payment limits might change based on fraud rules.
// Transfer limits might change based on account type.
// Abstracting them couples unrelated business rules.

// Similar structure, SAME semantic meaning - SAFE TO ABSTRACT
const formatUserDisplayName = (firstName: string, lastName: string): string => {
  return `${firstName} ${lastName}`.trim();
};

const formatCustomerDisplayName = (
  firstName: string,
  lastName: string
): string => {
  return `${firstName} ${lastName}`.trim();
};

const formatEmployeeDisplayName = (
  firstName: string,
  lastName: string
): string => {
  return `${firstName} ${lastName}`.trim();
};

// These all represent the same concept: "how we format a person's name for display"
// They share semantic meaning, not just structure
const formatPersonDisplayName = (
  firstName: string,
  lastName: string
): string => {
  return `${firstName} ${lastName}`.trim();
};

// Replace all call sites throughout the codebase:
// Before:
// const userLabel = formatUserDisplayName(user.firstName, user.lastName);
// const customerName = formatCustomerDisplayName(customer.firstName, customer.lastName);
// const employeeTag = formatEmployeeDisplayName(employee.firstName, employee.lastName);

// After:
// const userLabel = formatPersonDisplayName(user.firstName, user.lastName);
// const customerName = formatPersonDisplayName(customer.firstName, customer.lastName);
// const employeeTag = formatPersonDisplayName(employee.firstName, employee.lastName);

// Then remove the original functions as they're no longer needed
```

**Questions to ask before abstracting:**

- Do these code blocks represent the same concept or different concepts that happen to look similar?
- If the business rules for one change, should the others change too?
- Would a developer reading this abstraction understand why these things are grouped together?
- Am I abstracting based on what the code IS (structure) or what it MEANS (semantics)?

**Remember**: It's much easier to create an abstraction later when the semantic relationship becomes clear than to undo a bad abstraction that couples unrelated concepts.

##### 3. Understanding DRY - It's About Knowledge, Not Code

DRY (Don't Repeat Yourself) is about not duplicating **knowledge** in the system, not about eliminating all code that looks similar.

```typescript
// This is NOT a DRY violation - different knowledge despite similar code
const validateUserAge = (age: number): boolean => {
  return age >= 18 && age <= 100;
};

const validateProductRating = (rating: number): boolean => {
  return rating >= 1 && rating <= 5;
};

const validateYearsOfExperience = (years: number): boolean => {
  return years >= 0 && years <= 50;
};

// These functions have similar structure (checking numeric ranges), but they
// represent completely different business rules:
// - User age has legal requirements (18+) and practical limits (100)
// - Product ratings follow a 1-5 star system
// - Years of experience starts at 0 with a reasonable upper bound
// Abstracting them would couple unrelated business concepts and make future
// changes harder. What if ratings change to 1-10? What if legal age changes?

// Another example of code that looks similar but represents different knowledge:
const formatUserDisplayName = (user: User): string => {
  return `${user.firstName} ${user.lastName}`.trim();
};

const formatAddressLine = (address: Address): string => {
  return `${address.street} ${address.number}`.trim();
};

const formatCreditCardLabel = (card: CreditCard): string => {
  return `${card.type} ${card.lastFourDigits}`.trim();
};

// Despite the pattern "combine two strings with space and trim", these represent
// different domain concepts with different future evolution paths

// This IS a DRY violation - same knowledge in multiple places
class Order {
  calculateTotal(): number {
    const itemsTotal = this.items.reduce((sum, item) => sum + item.price, 0);
    const shippingCost = itemsTotal > 50 ? 0 : 5.99; // Knowledge duplicated!
    return itemsTotal + shippingCost;
  }
}

class OrderSummary {
  getShippingCost(itemsTotal: number): number {
    return itemsTotal > 50 ? 0 : 5.99; // Same knowledge!
  }
}

class ShippingCalculator {
  calculate(orderAmount: number): number {
    if (orderAmount > 50) return 0; // Same knowledge again!
    return 5.99;
  }
}

// Refactored - knowledge in one place
const FREE_SHIPPING_THRESHOLD = 50;
const STANDARD_SHIPPING_COST = 5.99;

const calculateShippingCost = (itemsTotal: number): number => {
  return itemsTotal > FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_COST;
};

// Now all classes use the single source of truth
class Order {
  calculateTotal(): number {
    const itemsTotal = this.items.reduce((sum, item) => sum + item.price, 0);
    return itemsTotal + calculateShippingCost(itemsTotal);
  }
}
```

##### 4. Maintain External APIs During Refactoring

Refactoring must never break existing consumers of your code:

```typescript
// Original implementation
export const processPayment = (payment: Payment): ProcessedPayment => {
  // Complex logic all in one function
  if (payment.amount <= 0) {
    throw new Error("Invalid amount");
  }

  if (payment.amount > 10000) {
    throw new Error("Amount too large");
  }

  // ... 50 more lines of validation and processing

  return result;
};

// Refactored - external API unchanged, internals improved
export const processPayment = (payment: Payment): ProcessedPayment => {
  validatePaymentAmount(payment.amount);
  validatePaymentMethod(payment.method);

  const authorizedPayment = authorizePayment(payment);
  const capturedPayment = capturePayment(authorizedPayment);

  return generateReceipt(capturedPayment);
};

// New internal functions - not exported
const validatePaymentAmount = (amount: number): void => {
  if (amount <= 0) {
    throw new Error("Invalid amount");
  }

  if (amount > 10000) {
    throw new Error("Amount too large");
  }
};

// Tests continue to pass without modification because external API unchanged
```

##### 5. Verify and Commit After Refactoring

**CRITICAL**: After every refactoring:

1. Run all tests - they must pass without modification
2. Run static analysis (linting, type checking) - must pass
3. Commit the refactoring separately from feature changes

```bash
# After refactoring
npm test          # All tests must pass
npm run lint      # All linting must pass
npm run typecheck # TypeScript must be happy

# Only then commit
git add .
git commit -m "refactor: extract payment validation helpers"
```

#### Refactoring Checklist

Before considering refactoring complete, verify:

- [ ] The refactoring actually improves the code (if not, don't refactor)
- [ ] All tests still pass without modification
- [ ] All static analysis tools pass (linting, type checking)
- [ ] No new public APIs were added (only internal ones)
- [ ] Code is more readable than before
- [ ] Any duplication removed was duplication of knowledge, not just code
- [ ] No speculative abstractions were created
- [ ] The refactoring is committed separately from feature changes

#### Example Refactoring Session

```typescript
// After getting tests green with minimal implementation:
describe("Order processing", () => {
  it("calculates total with items and shipping", () => {
    const order = { items: [{ price: 30 }, { price: 20 }], shipping: 5 };
    expect(calculateOrderTotal(order)).toBe(55);
  });

  it("applies free shipping over £50", () => {
    const order = { items: [{ price: 30 }, { price: 25 }], shipping: 5 };
    expect(calculateOrderTotal(order)).toBe(55);
  });
});

// Green implementation (minimal):
const calculateOrderTotal = (order: Order): number => {
  const itemsTotal = order.items.reduce((sum, item) => sum + item.price, 0);
  const shipping = itemsTotal > 50 ? 0 : order.shipping;
  return itemsTotal + shipping;
};

// Commit the working version
// git commit -m "feat: implement order total calculation with free shipping"

// Assess refactoring opportunities:
// - The variable names could be clearer
// - The free shipping threshold is a magic number
// - The calculation logic could be extracted for clarity
// These improvements would add value, so proceed with refactoring:

const FREE_SHIPPING_THRESHOLD = 50;

const calculateItemsTotal = (items: OrderItem[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

const calculateShipping = (
  baseShipping: number,
  itemsTotal: number
): number => {
  return itemsTotal > FREE_SHIPPING_THRESHOLD ? 0 : baseShipping;
};

const calculateOrderTotal = (order: Order): number => {
  const itemsTotal = calculateItemsTotal(order.items);
  const shipping = calculateShipping(order.shipping, itemsTotal);
  return itemsTotal + shipping;
};

// Run tests - they still pass!
// Run linting - all clean!
// Run type checking - no errors!

// Now commit the refactoring
// git commit -m "refactor: extract order total calculation helpers"
```

##### Example: When NOT to Refactor

```typescript
// After getting this test green:
describe("Discount calculation", () => {
  it("should apply 10% discount", () => {
    const originalPrice = 100;
    const discountedPrice = applyDiscount(originalPrice, 0.1);
    expect(discountedPrice).toBe(90);
  });
});

// Green implementation:
const applyDiscount = (price: number, discountRate: number): number => {
  return price * (1 - discountRate);
};

// Assess refactoring opportunities:
// - Code is already simple and clear
// - Function name clearly expresses intent
// - Implementation is a straightforward calculation
// - No magic numbers or unclear logic
// Conclusion: No refactoring needed. This is fine as-is.

// Commit and move to the next test
// git commit -m "feat: add discount calculation"
```

### Commit Guidelines

- Each commit should represent a complete, working change
- Use conventional commits format:
  ```
  feat: add payment validation
  fix: correct date formatting in payment processor
  refactor: extract payment validation logic
  test: add edge cases for payment validation
  ```
- Include test changes with feature changes in the same commit

### Pull Request Standards

- Every PR must have all tests passing
- All linting and quality checks must pass
- Work in small increments that maintain a working state
- PRs should be focused on a single feature or fix
- Include description of the behavior change, not implementation details

## Working with Claude

### Expectations

When working with my Claude Code:

1. **ALWAYS FOLLOW TDD** - No production code without a failing test. This is not negotiable.
2. **Think deeply** before making any edits
3. **Understand the full context** of the code and requirements
4. **Ask clarifying questions** when requirements are ambiguous
5. **Think from first principles** - don't make assumptions
6. **Assess refactoring after every green** - Look for opportunities to improve code structure, but only refactor if it adds value
7. **Keep project docs current** - update them whenever you introduce meaningful changes
   **At the end of every change, update CLAUDE.md with anything useful you wished you'd known at the start**.
   This is CRITICAL - Claude should capture learnings, gotchas, patterns discovered, or any context that would have made the task easier if known upfront. This continuous documentation ensures future work benefits from accumulated knowledge

### Code Changes

When suggesting or making changes:

- **Start with a failing test** - always. No exceptions.
- After making tests pass, always assess refactoring opportunities (but only refactor if it adds value)
- After refactoring, verify all tests and static analysis pass, then commit
- Respect the existing patterns and conventions
- Maintain test coverage for all behavior changes
- Keep changes small and incremental
- Ensure all TypeScript strict mode requirements are met
- Provide rationale for significant design decisions

**If you find yourself writing production code without a failing test, STOP immediately and write the test first.**

### Communication

- Be explicit about trade-offs in different approaches
- Explain the reasoning behind significant design decisions
- Flag any deviations from these guidelines with justification
- Suggest improvements that align with these principles
- When unsure, ask for clarification rather than assuming

## Example Patterns

### Error Handling

Use Result types or early returns:

```typescript
// Good - Result type pattern
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

const processPayment = (
  payment: Payment
): Result<ProcessedPayment, PaymentError> => {
  if (!isValidPayment(payment)) {
    return { success: false, error: new PaymentError("Invalid payment") };
  }

  if (!hasSufficientFunds(payment)) {
    return { success: false, error: new PaymentError("Insufficient funds") };
  }

  return { success: true, data: executePayment(payment) };
};

// Also good - early returns with exceptions
const processPayment = (payment: Payment): ProcessedPayment => {
  if (!isValidPayment(payment)) {
    throw new PaymentError("Invalid payment");
  }

  if (!hasSufficientFunds(payment)) {
    throw new PaymentError("Insufficient funds");
  }

  return executePayment(payment);
};
```

### Testing Behavior

```typescript
// Good - tests behavior through public API
describe("PaymentProcessor", () => {
  it("should decline payment when insufficient funds", () => {
    const payment = getMockPaymentPostPaymentRequest({ Amount: 1000 });
    const account = getMockAccount({ Balance: 500 });

    const result = processPayment(payment, account);

    expect(result.success).toBe(false);
    expect(result.error.message).toBe("Insufficient funds");
  });

  it("should process valid payment successfully", () => {
    const payment = getMockPaymentPostPaymentRequest({ Amount: 100 });
    const account = getMockAccount({ Balance: 500 });

    const result = processPayment(payment, account);

    expect(result.success).toBe(true);
    expect(result.data.remainingBalance).toBe(400);
  });
});

// Avoid - testing implementation details
describe("PaymentProcessor", () => {
  it("should call checkBalance method", () => {
    // This tests implementation, not behavior
  });
});
```

#### Achieving 100% Coverage Through Business Behavior

Example showing how validation code gets 100% coverage without testing it directly:

```typescript
// payment-validator.ts (implementation detail)
export const validatePaymentAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 10000;
};

export const validateCardDetails = (card: PayingCardDetails): boolean => {
  return /^\d{3,4}$/.test(card.cvv) && card.token.length > 0;
};

// payment-processor.ts (public API)
export const processPayment = (
  request: PaymentRequest
): Result<Payment, PaymentError> => {
  // Validation is used internally but not exposed
  if (!validatePaymentAmount(request.amount)) {
    return { success: false, error: new PaymentError("Invalid amount") };
  }

  if (!validateCardDetails(request.payingCardDetails)) {
    return { success: false, error: new PaymentError("Invalid card details") };
  }

  // Process payment...
  return { success: true, data: executedPayment };
};

// payment-processor.test.ts
describe("Payment processing", () => {
  // These tests achieve 100% coverage of validation code
  // without directly testing the validator functions

  it("should reject payments with negative amounts", () => {
    const payment = getMockPaymentPostPaymentRequest({ amount: -100 });
    const result = processPayment(payment);

    expect(result.success).toBe(false);
    expect(result.error.message).toBe("Invalid amount");
  });

  it("should reject payments exceeding maximum amount", () => {
    const payment = getMockPaymentPostPaymentRequest({ amount: 10001 });
    const result = processPayment(payment);

    expect(result.success).toBe(false);
    expect(result.error.message).toBe("Invalid amount");
  });

  it("should reject payments with invalid CVV format", () => {
    const payment = getMockPaymentPostPaymentRequest({
      payingCardDetails: { cvv: "12", token: "valid-token" },
    });
    const result = processPayment(payment);

    expect(result.success).toBe(false);
    expect(result.error.message).toBe("Invalid card details");
  });

  it("should process valid payments successfully", () => {
    const payment = getMockPaymentPostPaymentRequest({
      amount: 100,
      payingCardDetails: { cvv: "123", token: "valid-token" },
    });
    const result = processPayment(payment);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe("completed");
  });
});
```

### React Component Testing

```typescript
// Good - testing user-visible behavior
describe("PaymentForm", () => {
  it("should show error when submitting invalid amount", async () => {
    render(<PaymentForm />);

    const amountInput = screen.getByLabelText("Amount");
    const submitButton = screen.getByRole("button", { name: "Submit Payment" });

    await userEvent.type(amountInput, "-100");
    await userEvent.click(submitButton);

    expect(screen.getByText("Amount must be positive")).toBeInTheDocument();
  });
});
```

## Common Patterns to Avoid

### Anti-patterns

```typescript
// Avoid: Mutation
const addItem = (items: Item[], newItem: Item) => {
  items.push(newItem); // Mutates array
  return items;
};

// Prefer: Immutable update
const addItem = (items: Item[], newItem: Item): Item[] => {
  return [...items, newItem];
};

// Avoid: Nested conditionals
if (user) {
  if (user.isActive) {
    if (user.hasPermission) {
      // do something
    }
  }
}

// Prefer: Early returns
if (!user || !user.isActive || !user.hasPermission) {
  return;
}
// do something

// Avoid: Large functions
const processOrder = (order: Order) => {
  // 100+ lines of code
};

// Prefer: Composed small functions
const processOrder = (order: Order) => {
  const validatedOrder = validateOrder(order);
  const pricedOrder = calculatePricing(validatedOrder);
  const finalOrder = applyDiscounts(pricedOrder);
  return submitOrder(finalOrder);
};
```

## Project Configuration

### Nutrient Viewer CDN Version Management

The Nutrient Viewer CDN version is managed through environment variables for easy updates:

```bash
# .env.production (tracked default) and .env.local
NUTRIENT_VIEWER_VERSION=1.20.0
```

The version is not a secret, so `.env.production` carries the real value rather than a
placeholder — that is the default a build uses. Three places can hold it and all three
should agree: `.env.production`, your local `.env.local`, and any Vercel environment
override. The version is used in `app/layout.tsx`:

```typescript
<Script
  src={`https://cdn.cloud.pspdfkit.com/pspdfkit-web@${process.env.NUTRIENT_VIEWER_VERSION}/nutrient-viewer.js`}
  strategy="beforeInteractive"
/>
```

**Important**: When updating the Nutrient Viewer version, also check:
1. TypeScript definitions in `global.d.ts` for API compatibility
2. The changelog at https://www.nutrient.io/guides/web/changelog/ for breaking changes
3. That the CDN URL actually resolves for the new version, e.g.
   `curl -I https://cdn.cloud.pspdfkit.com/pspdfkit-web@<version>/nutrient-viewer.js`
4. Run full test suite to ensure compatibility

The app's viewer surface is deliberately tiny — `NutrientViewer.load({ container, session,
useCDN })` and `NutrientViewer.unload(container)` — so most Web SDK breaking changes (UI
slots, form field options, i18n keys) do not touch it. Note `useCDN` requires **1.9.1 or
later**; on older versions it is silently ignored.

### Next.js and Webpack Configuration

The project uses Next.js 16 with Turbopack. To exclude the `@nutrient-sdk/viewer` package from bundling (since we use the CDN version), we configure both server and client-side externals in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  // Exclude from server-side bundling (works with both Turbopack and Webpack)
  serverExternalPackages: ['@nutrient-sdk/viewer'],
  
  // Turbopack configuration for development
  turbopack: {
    resolveAlias: {
      '@nutrient-sdk/viewer': 'NutrientViewer',
    },
  },
  
  // Webpack configuration for production builds only
  webpack: (config, { isServer, dev }) => {
    // Only configure webpack externals when not using Turbopack (production builds)
    if (!isServer && !dev) {
      config.externals = {
        ...config.externals,
        '@nutrient-sdk/viewer': 'NutrientViewer',
      };
    }
    return config;
  },
};
```

This configuration:
- Prevents bundling the SDK on the server (`serverExternalPackages`)
- Uses Turbopack `resolveAlias` for development builds
- Uses Webpack externals only for production builds (`!dev`)
- Eliminates the "Webpack configured while Turbopack is not" warning

**Stale as of Next.js 16**: `next build` now uses Turbopack too, so the `webpack()` function
in `next.config.ts` never runs. `@nutrient-sdk/viewer` is also not an installed dependency —
the viewer comes entirely from the CDN script tag — so all three externals settings are
currently inert. They are harmless, but do not treat them as load-bearing, and consider
deleting the `webpack()` block next time this file is touched.

## Resources and References

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Testing Library Principles](https://testing-library.com/docs/guiding-principles)
- [Kent C. Dodds Testing JavaScript](https://testingjavascript.com/)
- [Functional Programming in TypeScript](https://gcanti.github.io/fp-ts/)
- [Nutrient Nutrient DWS Documentation](./de-api-docs/)

## Session Context for Resumption

### Current Project State (Session End)
The Nutrient DWS CRUD application is **85% complete** with comprehensive mobile responsiveness and theming:

#### ✅ **Fully Functional Features:**
1. **Authentication**: Google OAuth with NextAuth.js, role-based access (ADMIN/USER)
2. **Document Management**: Full CRUD operations with delete functionality and permissions
3. **File Upload**: Drag-and-drop interface with 250MB limit, progress tracking and error handling
4. **Document Viewer**: Embedded Nutrient Viewer with JWT authentication and full viewport height
5. **Admin Features**: Role impersonation (admin can view as user)
6. **Mobile Responsiveness**: Card layouts on mobile, table layouts on desktop across all pages
7. **Theme System**: Complete dark/light mode with CSS custom properties and localStorage persistence
8. **Search API**: Server-side search with filtering by title, filename, author and sorting capabilities
9. **UI/UX Enhancements**: Consistent headers, improved text contrast, compact metadata tables
10. **Technical Stack**: Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL, Tailwind CSS v4

#### 🔄 **Remaining Tasks (2 items):**
1. **Client-Side Search UI**: Search bar, filter dropdowns, sort controls (High Priority)
2. **Testing**: Comprehensive test suite for all features (High Priority)

### Key Technical Context

#### **Important Configurations:**
- **Turbopack/Webpack**: Properly configured for CDN externals (no warnings)
- **Environment Variables**: All secrets externalized, CDN version managed
- **TypeScript**: Strict mode, comprehensive Nutrient Viewer API types
- **Database**: PostgreSQL with role-based document filtering and search capabilities
- **Theme System**: CSS custom properties with dark/light mode persistence
- **File Uploads**: 250MB limit with progress tracking and retry logic

#### **Critical Code Locations:**
- **Authentication**: `lib/auth.ts`, `lib/auth-config.ts`
- **API Routes**: `app/api/documents/` (CRUD with search, filtering, and delete)
- **UI Components**: `components/document-list.tsx`, `components/document-viewer.tsx`
- **Theme System**: `components/providers/theme-provider.tsx`, `components/theme-toggle.tsx`
- **Types**: `global.d.ts` (Nutrient Viewer definitions)

#### **Known Working Features:**
- Complete OAuth login/logout flow with role switching
- File upload to Nutrient DWS (up to 250MB) with progress tracking
- Responsive document list (mobile cards, desktop table) with delete functionality
- Admin role switching (SELF ↔ USER modes) with permission-based UI
- Full viewport document viewer with compact metadata and JWT auth
- Dark/light theme system with localStorage persistence
- Server-side search API with filtering and sorting by multiple fields
- Mobile-responsive design across all routes
- Error handling, retry mechanisms, and loading states

#### **Architecture Notes:**
- Server components for data fetching, client components for interactivity
- JWT authentication for Nutrient DWS viewer access
- Role-based document filtering at database level
- CDN-based Nutrient Viewer (version 1.20.0) with proper positioning
- Mobile-first responsive design with Tailwind CSS v4
- Theme system using CSS custom properties for consistency

### Next Session Priorities

#### **1. Client-Side Search & Filter UI Implementation (High Priority)**
**Dashboard Search Components**:
- Add search bar with debounced input and clear button functionality
- Create filter dropdowns for file type, author, and date range selection
- Implement sort controls with ascending/descending options for multiple fields
- Add URL-based search state persistence for bookmarkable searches

**User Experience**:
- Loading states during search operations
- Empty state handling for no search results
- Search result count display
- Clear all filters functionality

#### **2. Comprehensive Testing Suite (High Priority)**
**Authentication & Authorization Tests**:
- OAuth flow testing with Google provider
- Role-based access control testing (ADMIN/USER permissions)
- Admin impersonation mode functionality

**Document Management Tests**:
- File upload testing (including large files up to 250MB)
- Document CRUD operations (create, read, delete)
- Document viewer integration with JWT authentication
- Search and filtering functionality

**UI/UX Tests**:
- Mobile responsiveness across all breakpoints
- Theme switching (dark/light mode) functionality
- Component interaction and error handling
- Cross-browser compatibility testing

### Development Environment
- **Database**: PostgreSQL running on localhost:5432
- **Next.js**: Development server on localhost:3000
- **Commands**: `pnpm dev` (development), `npm run build` (production test)

### Current Application Status
The application is **85% complete** and production-ready for core functionality. All major features are implemented including:
- Complete authentication and authorization system
- Full document management with CRUD operations and delete permissions
- Mobile-responsive UI with comprehensive dark/light theme support
- Large file upload capabilities (250MB) with progress tracking
- Full viewport document viewer with optimized metadata display
- Server-side search API with filtering and sorting capabilities

**Remaining work focuses on client-side search UI and comprehensive testing to achieve 100% completion.**

## DWS Comment API — verified behaviour

Established by probing the live API on 2026-08-24 with the working key in
`.env.local`. These are observations, not documentation, and the docs are thin
here. See also the "Nutrient DWS" notes above.

- **There are two keys, and only one of them works here.** A Nutrient account
  issues a **Viewer** key and a **Processor** key. Both start with `pdf_live_`
  and are 52 characters, so they are easy to swap by mistake. Everything this app
  does is the Viewer API, and the Processor key answers `403 Forbidden` to every
  Viewer request — including `GET /viewer/documents`, which names no document.
  Read them from `NUTRIENT_VIEWER_API_KEY` via `lib/nutrient-key.ts`.
- **Read the shape of a 403 before blaming permissions.** A 403 on *every* call
  including org-level listing means the wrong key of the two. A 403 on writes
  while reads succeed means the right key without write access.
- **The whole comment layer is verified working**: create a thread, append a
  comment, fetch comments, list thread roots, delete a thread.
- **A comment cannot be deleted.** There is no delete endpoint for comments in
  either the DWS Viewer API or the Document Engine API. To remove a comment you
  delete the thread's **root annotation** —
  `DELETE /viewer/documents/{doc}/annotations/{rootAnnotationId}` returns 200 and
  takes the thread's comments with it. This is the only cleanup lever, so treat
  anything written to a demo document as permanent until the thread goes.
- **`POST /viewer/sessions` returns the token as `jwt`.** Not `session_token`,
  not `sessionToken`, not `token`. `lib/nutrient-api.ts` tries all of those and
  only the last fallback matches, so the earlier branches are dead code.
- **`user_id` round-trips as `createdBy`,** and `customData` round-trips intact —
  both confirmed by writing and reading back. This is what lets an emailed reply
  be attributed to a real account rather than a display name.
- **Check the licence in the session JWT, not the docs.** Decode the payload and
  read `allowed_operations`; this project's key carries `comments`,
  `comments_api` and `instant`.

### Replaying a real inbound email

Resend retains delivered webhook events, and they are the only trustworthy
fixture for `email.received` — a handwritten one already shipped a silent bug by
inventing a `text` field that Resend never sends.

```
GET /webhooks/{webhookId}/events            # list recent deliveries
GET /webhooks/{webhookId}/events/{eventId}  # the exact payload that was sent
```

Replaying one end-to-end needs the reply token in the event to exist in whichever
database the app is pointed at; tokens minted in production are not in the local
database.

## SMS notifications (Twilio)

- **Twilio signs nothing like Resend does.** HMAC-SHA1 over the full URL plus
  every POST parameter sorted by key and concatenated as `key + value`, in
  `X-Twilio-Signature`. `lib/twilio.ts` is a sibling of `lib/webhook-signature.ts`,
  not a parameter on it.
- **A Twilio signature carries no timestamp,** so unlike the Resend verifier there
  is no replay window to check. The unique constraint on
  `InboundSms.providerMessageId` bounds replay of the **reply path only** — the
  claim happens after the keyword (STOP/START/HELP) and registration branches
  have already returned. A captured, signed HELP request (or STOP/START) can be
  replayed indefinitely; each replay still costs a real side effect (an
  outbound SMS, a database write). Do not describe this constraint as bounding
  replay of the whole webhook.
- **`TWILIO_AUTH_TOKEN` is also the webhook signing key.** Rotating it silently
  breaks inbound verification.
- **Behind a proxy, Twilio signs the URL it was configured with,** which may not
  match `request.url`. `TWILIO_WEBHOOK_URL` pins it when they disagree.
- **Threading is last-thread-wins and the credential is the sender's phone
  number.** Weaker than the email token path on purpose — an SMS has nowhere to
  hide a per-thread token. Read the header comment in
  `app/api/webhooks/twilio/route.ts` before copying the pattern elsewhere.
- **SMS never carries comment text.** A lock screen is a different privacy
  posture from an inbox. `buildMentionSms` takes no `commentText` parameter, so
  reintroducing one is a visible signature change rather than a quiet one.
- **STOP/HELP are handled in our webhook rather than left to Twilio's Advanced
  Opt-Out,** so `smsOptedOutAt` reflects reality and the notifier stops queuing
  sends Twilio would otherwise silently drop. Keyword matching is whole-message
  (STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT to opt out; START/YES/UNSTOP to
  opt back in; HELP/INFO for help), not substring, and it is checked before the
  verification-code check so a STOP from an otherwise-valid sender still opts
  them out rather than being swallowed as a reply attempt.
- **A verification code cannot be brute-force-capped per row, because the guess
  is unauthenticated.** The natural-looking implementation —
  `findFirst({ where: { code, verifiedAt: null } })` — puts the guessed code
  in the SQL `WHERE` clause, so a wrong guess matches zero rows and returns
  before any attempt counter is touched. `PhoneVerification.attempts` only
  bounds retries against a row that already matched; it cannot bound guessing
  at all, because a wrong guess never identifies a row to charge. That shipped
  in this plan's first draft and was caught in review. The fix is to throttle
  by **sender phone number** (a separate table of failed attempts per phone
  within the TTL window, checked before the lookup), not by row — capping the
  row lets an attacker's failures decrement other users' attempt budgets and
  turns the "cap" into a denial-of-service tool. This is also what
  `TODO.md` section 19 originally asked for and the plan itself had dropped.
  Canonicalise the phone number before using it as a lookup or throttle key —
  the inbound webhook is the boundary where a raw carrier-supplied number
  first enters the system, and today it relies on Twilio's E.164 guarantee
  rather than doing its own normalisation.
- **`buildMentionSms` deliberately does not fit a single 160-char segment.**
  It used to truncate the title to fit one GSM segment, and that truncation was
  removed on purpose — do not reintroduce it. Two things made it
  counterproductive rather than merely imperfect: with a real
  `NEXT_PUBLIC_APP_URL` (roughly 68 chars on a `vercel.app` host, versus ~35 in
  the old test fixture) and a normal author name, the fixed overhead alone
  regularly left less than 160 chars of budget, so truncation ran on *every*
  realistic message, not as a rare edge case. Worse, the truncation used `…`
  (U+2026, not in the GSM 03.38 alphabet), which forces the whole message into
  UCS-2 — a **70**-char segment instead of 160. So "truncating to fit one
  segment" produced *three* UCS-2 segments where the untruncated GSM original
  would have been two: truncating cost more than it saved, always. The message
  now keeps the full title and full URL and accepts concatenated (multi-part)
  SMS. If someone proposes truncation again, they must not use `…` or any other
  non-GSM character to do it.
- **`prisma migrate dev` can offer to reset the database on drift.** Use
  `prisma migrate dev --create-only` to generate the SQL, review it, then apply
  with `prisma migrate deploy`. `--create-only` can still block on an
  interactive confirmation prompt when the migration carries a warning (e.g.
  adding a `@unique` constraint to an existing column) — expect to answer it,
  don't fall back to bare `migrate dev` to dodge it.
- **`Prisma.dmmf` does not expose `isUnique` on Prisma 7.9.1**, even for
  known-unique fields like `User.email`. Assert a schema's uniqueness
  constraints with a type-level guard instead: a bare `{ field: value }`
  literal only type-checks against a model's generated `WhereUniqueInput` when
  that field actually carries `@unique`/`@id`. That guard is enforced by
  `pnpm typecheck`, not by `vitest run` — so `pnpm pre-commit` (which runs
  typecheck before test) is the real gate, and a workflow that runs bare
  `pnpm test` will not catch a dropped `@unique`.
- **`requireAuth()` in a try/catch, mapping the message `'Authentication
  required'` to a 401, is the house pattern** for every route under
  `app/api/`. `lib/auth.ts` has no `auth` export — the available session
  helpers are `getSession`, `requireAuth`, `requireAdmin`,
  `getEffectiveDocumentFilter`, `getDocumentWriteFilter`,
  `canPerformAdminActions`, and the `SessionUser` type. (A pre-existing, unrelated
  bug: `app/api/user/impersonation/route.ts`'s catch blocks return a bare 500
  instead of following this pattern, so an unauthenticated call to it answers
  500 where every other route answers 401. Not introduced by SMS work; worth
  its own small fix.)
- **Trial account:** sends only to verified numbers, prepends "Sent from your
  Twilio trial account", 100-message allowance. A round trip costs 2–3 messages.
  Skip the Messaging Service while on trial and set the webhook directly on the
  number: Phone Numbers → Manage → Active numbers → Messaging → "A message comes
  in" → POST to `/api/webhooks/twilio`.
- **A2P 10DLC registration is required before sending to ordinary US numbers.**
  Days to weeks, with fees, and it can be rejected. The legal pages it requires
  are live at `https://jonaddams.com/privacy`, `/terms` and `/sms`. The
  published number in `lib/legal.ts` (in the `nutrient-sdk-samples` repo) must
  match the number actually registered for the campaign, or the filing is
  inconsistent with what a recipient can look up.
- **Three places state the program name and must agree**: `PROGRAM_NAME` in
  `lib/mention-sms.ts` (what recipients actually receive), `LEGAL.appName` in
  `nutrient-sdk-samples/lib/legal.ts` (what `/sms` publishes), and the sample
  messages filed with the A2P campaign. The name is currently **Bindery**, which
  is deliberately *not* the repository name or the deployment host — a reviewer
  compares the filing against the published page against a real message, so
  renaming the project does not license changing this. The first submission was
  rejected on its Call-to-Action check with several of these disagreeing at once:
  the page named a host that did not resolve, published the trial number rather
  than the registered one, and showed a `Bindery:` prefix the code did not send.

## Authentication (BetterAuth)

Replaced NextAuth v4 on 2026-09-02. Pinned to `better-auth@1.7.2`. Design and
plan: `docs/superpowers/specs/2026-09-02-betterauth-migration-design.md` and
`docs/superpowers/plans/2026-09-02-betterauth-migration.md`.

- **`lib/auth.ts`'s public surface is deliberately frozen.** Twelve routes under
  `app/api/` catch the error `requireAuth()` throws and compare
  `error.message === 'Authentication required'` **literally** to map it to a 401.
  Reword that string and every unauthenticated request becomes a 500 instead.
  Holding the surface still is what kept the migration to nine files: the twelve
  routes, the four route tests that `vi.mock('@/lib/auth')`, and `lib/auth.test.ts`
  all needed no edit. `lib/auth.test.ts` passing **unmodified** is the regression
  guard — if a future change needs to touch it, that is the signal the surface
  moved.
- **There is no `requireAdmin` any more.** It was exported and called from
  nowhere, and its `'Admin access required'` string was matched nowhere.
- **`getSession()` re-reads `role` and `currentImpersonationMode` from Postgres
  on every call**, rather than using BetterAuth's session-cached
  `user.additionalFields`. The admin role switcher writes to the `users` row; a
  cached value makes the switcher appear to do nothing until the next sign-in.
  The extra query is the point, not an oversight. Both fields are still declared
  as `additionalFields` so the inferred client knows their types, but
  `getSession()` overwrites them from the fresh row.
- **`session.user.id` never varies with `currentImpersonationMode`.**
  Impersonation widens document *visibility* only. DWS records this id as a
  comment's author and it is what a verified phone number binds to, so
  conflating the two would post comments as someone else and bind an admin's
  phone to another account. Asserted for all three enum values in
  `lib/auth-session.test.ts`.
- **`account.issuer` is required in BetterAuth 1.7.2**, alongside `accountId` and
  `providerId`, and the account unique key is `(issuer, accountId)` — not
  `(provider, providerAccountId)`. Google declares a literal `accountIssuer` of
  `https://accounts.google.com`; Microsoft resolves its own from `profile.iss`
  (so `${authority}/${tid}/v2.0`). BetterAuth's synthetic `local:oauth:<id>`
  form applies **only** to providers that declare neither, so it is not what
  either of ours uses. The migration backfills the Google literal. Get that
  string wrong and an existing row stops matching at sign-in: BetterAuth treats
  the account as unknown, falls through to linking-by-email, and quietly creates
  a duplicate account row rather than failing.
- **`@better-auth/cli` lags the library** — published at 1.4.21 against a 1.7.2
  library — so it is not a safe schema source. Read the truth out of the
  installed package instead: `getAuthTables()` exported from `better-auth/db` is
  what the runtime itself uses. Calling it with the real options prints every
  table, column, index and foreign key.
- **`prisma migrate dev` cannot generate this kind of migration.** It emits
  `DROP COLUMN` / `ADD COLUMN` pairs for what are really renames, which would
  discard every account row, and it refuses to run non-interactively at all.
  `prisma/migrations/20260902143940_betterauth/migration.sql` is hand-written for
  that reason. Renaming in place is what preserves `users.id`, and six tables
  carry foreign keys to it.
- **The domain allowlist lives in `user.validateUserInfo`**, not in a
  `databaseHooks.user.create.before` hook. `validateUserInfo` fires on
  `create-user`, `link-account` **and** `sign-in`; the create hook would guard
  only first sign-up and let a linking flow straight through. The predicate
  (`isAllowedEmailDomain` in `lib/auth-config.ts`) compares the segment after the
  **last** `@` for equality: a suffix test would admit `notnutrient.io`, and
  splitting on the first `@` would admit `nutrient.io@gmail.com`.
- **Account linking is enabled** with `trustedProviders: ['google', 'microsoft']`.
  One person who uses both providers must be one user row, or document ownership
  splits and comments follow the wrong identity. `allowDifferentEmails` stays
  off.
- **Microsoft is single-tenant** via `MICROSOFT_TENANT_ID`. Given a real tenant
  GUID the provider also pins expected-issuer validation on the id token, which
  the `common` and `organizations` scopes cannot do. The provider key is
  `microsoft` (the implementation file is named `microsoft-entra-id`), and the
  Entra redirect URI is `/api/auth/callback/microsoft`.
- **Google's callback path is unchanged** from the NextAuth era
  (`/api/auth/callback/google`), so no Google Cloud Console edit was needed. Only
  the catch-all route folder moved, from `[...nextauth]` to `[...all]`.
- **`betterAuth()` constructs lazily.** With no secret, no base URL, no database
  and empty provider credentials it still returns a working object and only
  warns. That is why `lib/auth.test.ts` and `lib/auth-config.test.ts` import
  cleanly with no auth environment set and need no `vitest.setup.ts` shims.
- **Set `BETTER_AUTH_URL` in every deployed environment.** Without it BetterAuth
  derives the origin from the incoming request and warns that callbacks and
  redirects may misbehave. Locally it is `http://localhost:3000`.
- **`BETTER_AUTH_SECRET` can reuse the old `NEXTAUTH_SECRET` value.** Nothing
  re-encrypts across the migration, and the sessions table is truncated anyway,
  so the only cost of keeping it is none and the only cost of changing it is
  another forced sign-in.
- **BetterAuth's client keeps session state in a store, not React context**, so
  there is no session provider in `app/layout.tsx` and there should not be one.
  `useSession()` returns `{ data, isPending, error, refetch }` — `isPending`,
  not a `status` string, and `refetch()` where NextAuth had `update()`.
  `hooks/use-impersonation.ts` calls `refetch()` rather than writing the new mode
  into the session, because the server already re-reads it per request; writing
  it client-side would create a second source of truth.

### A worktree nested inside the checkout defeats `tsc` on removed dependencies

`.claude/worktrees/<name>` sits **inside** the main checkout, so Node and
TypeScript module resolution walk up and find the parent's `node_modules`. After
`pnpm remove next-auth` in a worktree, `import { useSession } from
'next-auth/react'` still type-checked, because the main checkout still had
next-auth installed. `pnpm typecheck` reported a clean pass with a broken import
in `hooks/use-impersonation.ts`.

So when removing a dependency, **grep for its imports; do not trust typecheck**:

```bash
grep -rn "from 'next-auth" app lib components hooks types global.d.ts
```

Note also that `hooks/` is easy to omit from a survey sweep — that is exactly how
the stale import above survived until the grep.

### Grepping imports is still not enough: hardcoded endpoint URLs

An import search finds none of this. `components/dashboard-header.tsx`,
`app/upload/page.tsx` and `app/documents/[id]/page.tsx` each carried

```tsx
<Link href="/api/auth/signout">Sign out</Link>
```

NextAuth served a GET page there. BetterAuth's endpoint is
**`POST /api/auth/sign-out`** — different path, different method — so sign-out
broke on all three pages while the build, the typecheck and every test stayed
green. Nothing imports anything; it is a string.

`components/sign-out-button.tsx` now owns this: a button that calls the client's
`signOut()`, used everywhere. It keeps the method correct and the URL out of the
markup, so the next auth change cannot repeat the failure. When swapping an auth
library, also grep the provider's route prefix:

```bash
grep -rn "/api/auth/" app components hooks lib
```

## Deploying a schema change

**Nothing applies migrations for you.** `postinstall` runs `prisma generate`, not
`prisma migrate deploy`, and the Vercel build does not touch the database. So a
deploy that changes `schema.prisma` ships a Prisma client that selects columns
the production database does not have, and **`migrate deploy` is a separate
manual step that has to happen for every such deploy**.

This is not hypothetical. The SMS work merged and deployed on 2026-08-31 without
its two migrations being applied to production Neon. Every query touching `users`
then failed with

```
PrismaClientKnownRequestError (P2022)
The column `users.phone` does not exist in the current database.
```

which surfaced as `[next-auth][error][adapter_error_getUserByAccount]` and sent
the browser to `/api/auth/error?error=Callback`. **Nobody could sign in to
production for two days**, and it went unnoticed because
`/api/auth/session` still answers `200` (with `SESSION_ERROR` logged
server-side), so the app looks healthy from the outside. It was found only
because a *different* auth problem was being chased.

Read the real error from the function logs — the browser never shows it:

```bash
vercel logs <deployment-url> --json | grep -i "next-auth\]\[error\|P2022"
```

### Applying a migration to production

Run it from a checkout on the branch that is **actually deployed**, because
`migrate deploy` applies *every* pending migration in `prisma/migrations`, not
just the ones belonging to your change. Running it from a feature worktree
applies that feature's migrations too — which is how you would put a BetterAuth
schema onto a production still running NextAuth code.

```bash
git switch main
vercel env pull .env.prod.tmp --environment=production --project dws-crud
set -a; . ./.env.prod.tmp; set +a
pnpm prisma migrate status   # confirm ONLY the expected migrations are pending
pnpm prisma migrate deploy
rm -f .env.prod.tmp
```

`prisma.config.ts` prefers `DATABASE_POSTGRES_URL_NON_POOLING`, which only the
pulled production file provides, so it wins over a local `DATABASE_URL` and the
command cannot accidentally target localhost. No redeploy is needed afterwards:
the schema is read at query time, not build time.

**`DEPLOYMENT.md` is stale on this subject and partly unsafe.** It tells you to
`vercel env pull .env.local` (which overwrites your local dev configuration with
production values), to run `prisma db push` against production after
`migrate deploy` (`db push` alters the schema with no migration record and can
drop columns), and to read `DATABASE_URL` out of `.env.production`, which no
longer carries any database variables. Prefer the steps above.

### Ordering rule

For a migration that only **adds** columns or tables, migrate first, then deploy;
either order works, and migrating first means the window of mismatch is zero.

For one that **renames, drops, or retypes** anything — the BetterAuth migration
does all three — the code and the schema are not compatible in either direction,
so there is no safe gap. Apply the migration and promote the deployment
together, and expect a brief window where in-flight requests fail.

## Summary

The key is to write clean, testable, functional code that evolves through small, safe increments. Every change should be driven by a test that describes the desired behavior, and the implementation should be the simplest thing that makes that test pass. When in doubt, favor simplicity and readability over cleverness.
