import { CodeMaker } from 'codemaker';
import { EnumType, EnumMember } from 'jsii-reflect';

import { SpecialDependencies } from '../dependencies';
import { EmitContext } from '../emit-context';
import { Package } from '../package';
import { JSII_INIT_ALIAS, JSII_INIT_FUNC, JSII_RT_ALIAS } from '../runtime';
import { emitOptionImplementation } from './_markers';
import { GoType } from './go-type';

export class Enum extends GoType {
  private readonly members: readonly GoEnumMember[];

  public constructor(pkg: Package, public type: EnumType) {
    super(pkg, type);

    this.members = type.members.map((mem) => new GoEnumMember(this, mem));
  }

  public emit(context: EmitContext) {
    this.emitDocs(context);

    const { code } = context;
    // TODO figure out the value type -- probably a string in most cases
    const valueType = 'string';
    code.line(`type ${this.name} ${valueType}`);
    code.line();

    code.open(`const (`);
    // Const values are prefixed by the wrapped value type
    for (const member of this.members) {
      member.emit(code);
    }
    code.close(`)`);
    code.line();

    emitOptionImplementation(context, this.name, this.name);
  }

  public emitRegistration(code: CodeMaker): void {
    code.open(`${JSII_RT_ALIAS}.RegisterEnum[${this.name}](`);
    code.line(`"${this.fqn}",`);
    code.line(`${JSII_INIT_ALIAS}.${JSII_INIT_FUNC},`);
    code.open(`map[string]interface{}{`);
    for (const member of this.members) {
      code.line(`"${member.rawValue}": ${member.name},`);
    }
    code.close(`},`);
    code.close(')');
  }

  public get dependencies(): Package[] {
    return [];
  }

  public get specialDependencies(): SpecialDependencies {
    return {
      runtime: false,
      api: false,
      init: false,
      internal: false,
    };
  }
}

class GoEnumMember {
  public readonly name: string;
  public readonly rawValue: string;

  public constructor(private readonly parent: Enum, entry: EnumMember) {
    this.name = `${parent.name}_${entry.name}`;
    this.rawValue = entry.name;
  }

  public emit(code: CodeMaker) {
    code.line(`${this.name} ${this.parent.name} = "${this.rawValue}"`);
  }
}
