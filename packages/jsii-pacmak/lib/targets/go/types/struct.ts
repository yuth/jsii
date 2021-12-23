import * as assert from 'assert';
import { CodeMaker } from 'codemaker';
import { InterfaceType } from 'jsii-reflect';

import { SpecialDependencies } from '../dependencies';
import { EmitContext } from '../emit-context';
import { Package } from '../package';
import { JSII_INIT_ALIAS, JSII_INIT_FUNC, JSII_RT_ALIAS } from '../runtime';
import { getMemberDependencies } from '../util';
import { emitOptionImplementation } from './_markers';
import { GoType } from './go-type';
import { GoProperty } from './type-member';

/*
 * Struct wraps a JSII datatype interface aka, structs
 */
export class Struct extends GoType {
  private readonly properties: readonly GoProperty[];

  public constructor(parent: Package, public readonly type: InterfaceType) {
    super(parent, type);

    assert(
      type.isDataType(),
      `The provided interface ${type.fqn} is not a struct!`,
    );

    this.properties = type.allProperties.map(
      (prop) => new GoProperty(this, prop),
    );
  }

  public get dependencies(): Package[] {
    return getMemberDependencies(this.properties);
  }

  public get specialDependencies(): SpecialDependencies {
    return {
      runtime: false,
      api: this.properties.some((p) => p.specialDependencies.api),
      init: false,
      internal: false,
    };
  }

  public emit(context: EmitContext): void {
    const { code, documenter } = context;
    documenter.emit(this.type.docs);
    code.openBlock(`type ${this.name} struct`);
    for (const property of this.properties) {
      property.emitStructMember(context);
    }
    code.closeBlock();
    code.line();

    emitOptionImplementation(context, this.name, this.name);
  }

  public emitRegistration(code: CodeMaker): void {
    code.open(`${JSII_RT_ALIAS}.RegisterStruct[${this.name}](`);
    code.line(`"${this.fqn}",`);
    code.line(`${JSII_INIT_ALIAS}.${JSII_INIT_FUNC},`);
    code.close(')');
  }
}
