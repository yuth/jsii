import { EmitContext } from '../emit-context';

/**
 * Implements the `jsii.Option[T]` interface for a given type.
 *
 * @param code         the context where the code is being emitted.
 * @param instanceType the struct type that implements Optional.
 * @param optionalType the optional interface type being returned.
 */
export function emitOptionImplementation(
  { code }: EmitContext,
  instanceType: string,
  optionalType: string,
) {
  const self = instanceType.charAt(0).toLowerCase();

  code.line(
    `// FromOption__ unwraps an ${optionalType} from an Option[${optionalType}].`,
  );
  code.line('// You should never need to call this method directly.');
  code.openBlock(
    `func (${self} ${instanceType}) FromOption__() ${optionalType}`,
  );
  if (instanceType === optionalType) {
    code.line(`return ${self}`);
  } else {
    code.line(`var ${self}_ ${optionalType} = &${self}`);
    code.line(`return ${self}_`);
  }
  code.closeBlock();
  code.line();
}
