import { CodeMaker } from 'codemaker';

import { GoParameter } from '../types';
import { slugify } from './util';

/**
 * Packages arguments such that they can be sent correctly to the jsii runtime
 * library.
 *
 * @returns the expression to use in place of the arguments for the jsii
 *          runtime library call.
 */
export function emitArguments(
  code: CodeMaker,
  parameters: readonly GoParameter[],
  returnVarName: string,
): string | undefined {
  const checkedParameters = parameters
    // We only check required parameters (neither optional nor variadic)
    .filter(({ parameter }) => !parameter.optional && !parameter.variadic)
    // The only nil-able types are classes and interfaces. Unions also render as interface{} so they are nil-able in go.
    // Structs, enums and primitives are passed by-value when required, and those have non-nil zero values.
    .filter(
      ({ parameter }) =>
        parameter.type.unionOfTypes != null ||
        parameter.type.type?.isClassType() ||
        (parameter.type.type?.isInterfaceType() &&
          !parameter.type.type?.isDataType()),
    );
  for (const { name } of checkedParameters) {
    code.line(
      `if ${name} == nil { panic("Parameters \\"${name}\\" is required (received nil)") }`,
    );
  }
  const argsList = parameters.map((param) => param.name);
  if (argsList.length === 0) {
    return undefined;
  }
  if (parameters[parameters.length - 1].parameter.variadic) {
    // For variadic methods, we must build up the []interface{} slice by hand,
    // as there would not be any implicit conversion happening when passing
    // the variadic argument as a splat to the append function...
    const head = argsList.slice(0, argsList.length - 1);
    const tail = argsList[argsList.length - 1];

    const variable = slugify('args', [...argsList, returnVarName]);
    const elt = slugify('a', [variable]);
    code.line(`${variable} := []interface{}{${head.join(', ')}}`);
    code.openBlock(`for _, ${elt} := range ${tail}`);
    code.line(`${variable} = append(${variable}, ${elt})`);
    code.closeBlock();
    code.line();
    return variable;
  }
  return `[]interface{}{${argsList.join(', ')}}`;
}
