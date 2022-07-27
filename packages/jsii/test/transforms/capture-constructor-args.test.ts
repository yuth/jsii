import * as ts from 'typescript';

import { CaptureConstructorArgs } from '../../lib/transforms/capture-constructor-args';

test('leaves files without classes unaltered', () => {
  expect(transformedSource(EXAMPLE_NO_CLASS)).not.toContain('JSII_RTTI_SYMBOL');
});

test('update class', () => {

  expect(transformedSource(EXAMPLE_SINGLE_CLASS)).toContain(
    'getConstructorArgs',
  );
});

test('update class with multiple classes', () => {
  const transformedSrc = transformedSource(EXAMPLE_MULTIPLE_CLASSES);
  console.log(transformedSrc);
  expect(transformedSource(EXAMPLE_MULTIPLE_CLASSES)).toContain(
    'getConstructorArgs',
  );
});


function transformedSource(source: string) {
  const injector = new CaptureConstructorArgs();
  const transformed = ts.transform(
    ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest),
    [injector.runtimeArgCaptureTransformer()],
  );
  return ts
    .createPrinter()
    .printBundle(ts.createBundle(transformed.transformed));
}

/**
 * ===============================
 * =    EXAMPLE SOURCE FILES     =
 * ===============================
 */

const EXAMPLE_NO_CLASS = `
import * as ts from 'typescript';

interface Foo {
  readonly foobar: string;
}
`;

const EXAMPLE_SINGLE_CLASS = `
import * as ts from 'typescript';

class Foo {
  constructor(public readonly bar: string) {}
}
`;

const EXAMPLE_MULTIPLE_CLASSES = `
class Foo {
  constructor(public readonly bar: string) {}
  public doStuff() { return 42; }
}

interface FooBar {
  readonly answer: number;
}

/**
 * A bar.
 */
class Bar {
  public doStuffToo() {
    return new class implements FooBar {
      public readonly answer = 21;
    }();
  }
}

export default class {
  constructor() {}
}
`;

// const EXAMPLE_CONFLICTING_NAME = `
// import * as ts from 'typescript';

// const JSII_RTTI_SYMBOL_1 = 42;

// class Foo {
//   constructor(public readonly bar: string) {}
// }
// `;
