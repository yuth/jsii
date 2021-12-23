import { TypeReference } from 'jsii-reflect';

import * as log from '../../../logging';
import { SpecialDependencies } from '../dependencies';
import { Package } from '../package';
import { JSII_API_ALIAS } from '../runtime';
import { GoType } from './go-type';

/*
 * Maps names of JS primitives to corresponding Go types as strings
 */
class PrimitiveMapper {
  private readonly MAP: { [key: string]: string } = {
    number: `${JSII_API_ALIAS}.Number`,
    boolean: `${JSII_API_ALIAS}.Bool`,
    any: 'interface{}',
    date: `${JSII_API_ALIAS}.Time`,
    string: `${JSII_API_ALIAS}.String`,
    json: `${JSII_API_ALIAS}.Json`,
  };

  public constructor(private readonly name: string) {}

  public get goPrimitive(): string {
    const val = this.MAP[this.name];
    if (!val) {
      log.debug(`Unmapped primitive type: ${this.name}`);
    }

    return val ?? this.name;
  }
}

/**
 * TypeMap used to recursively resolve interfaces in nested types for use in
 * resolving scoped type names and implementation maps.
 */
type TypeMap =
  | { readonly type: 'primitive'; readonly value: string }
  | { readonly type: 'array'; readonly value: GoTypeRef }
  | { readonly type: 'map'; readonly value: GoTypeRef }
  | { readonly type: 'union'; readonly value: readonly GoTypeRef[] }
  | { readonly type: 'interface'; readonly value: GoTypeRef }
  | { readonly type: 'void' };

/*
 * Accepts a JSII TypeReference and Go Package and can resolve the GoType within the module tree.
 */
export class GoTypeRef {
  private _typeMap?: TypeMap;
  public constructor(
    public readonly root: Package,
    public readonly reference: TypeReference,
  ) {}

  public get type(): GoType | undefined {
    if (this.reference.fqn) {
      return this.root.findType(this.reference.fqn);
    }

    return undefined;
  }

  public get specialDependencies(): SpecialDependencies {
    return {
      runtime: false,
      api: containsBoxedPrimitive(this.reference),
      init: false,
      internal: false,
    };

    function containsBoxedPrimitive(ref: TypeReference): boolean {
      return (
        (ref.primitive != null && ref.primitive !== 'any') ||
        (ref.arrayOfType != null && containsBoxedPrimitive(ref.arrayOfType)) ||
        (ref.mapOfType != null && containsBoxedPrimitive(ref.mapOfType)) ||
        (ref.unionOfTypes != null &&
          ref.unionOfTypes.some(containsBoxedPrimitive))
      );
    }
  }

  public get primitiveType() {
    if (this.reference.primitive) {
      return new PrimitiveMapper(this.reference.primitive).goPrimitive;
    }

    return undefined;
  }

  public get name() {
    return this.type?.name;
  }

  public get datatype() {
    const reflectType = this.type?.type;
    return reflectType?.isInterfaceType() && reflectType.datatype;
  }

  public get namespace() {
    return this.type?.namespace;
  }

  public get void() {
    return this.reference.void;
  }

  public get typeMap(): TypeMap {
    if (!this._typeMap) {
      this._typeMap = this.buildTypeMap(this);
    }
    return this._typeMap;
  }

  /**
   * The go `import`s required in order to be able to use this type in code.
   */
  public get dependencies(): readonly Package[] {
    const ret = new Array<Package>();

    switch (this.typeMap.type) {
      case 'interface':
        if (this.type?.pkg) {
          ret.push(this.type?.pkg);
        }
        break;

      case 'array':
      case 'map':
        ret.push(...(this.typeMap.value.dependencies ?? []));
        break;

      case 'union':
        for (const t of this.typeMap.value) {
          ret.push(...(t.dependencies ?? []));
        }
        break;

      case 'void':
      case 'primitive':
        break;
    }

    return ret;
  }

  /*
   * Return the name of a type for reference from the `Package` passed in
   */
  public scopedName(scope: Package): string {
    return this.scopedTypeName(this.typeMap, scope, false);
  }

  public scopedReference(scope: Package, optional = false): string {
    return this.scopedTypeName(this.typeMap, scope, optional);
  }

  private buildTypeMap(ref: GoTypeRef): TypeMap {
    if (ref.primitiveType) {
      return { type: 'primitive', value: ref.primitiveType };
    } else if (ref.reference.arrayOfType) {
      return {
        type: 'array',
        value: new GoTypeRef(this.root, ref.reference.arrayOfType),
      };
    } else if (ref.reference.mapOfType) {
      return {
        type: 'map',
        value: new GoTypeRef(this.root, ref.reference.mapOfType),
      };
    } else if (ref.reference.unionOfTypes) {
      return {
        type: 'union',
        value: ref.reference.unionOfTypes.map(
          (typeRef) => new GoTypeRef(this.root, typeRef),
        ),
      };
    } else if (ref.reference.void) {
      return { type: 'void' };
    }

    return { type: 'interface', value: ref };
  }

  public scopedTypeName(
    typeMap: TypeMap,
    scope: Package,
    optional: boolean,
  ): string {
    switch (typeMap.type) {
      case 'primitive':
        const { value } = typeMap;
        return optional && value !== 'interface{}' ? wrap(value) : value;
      case 'array':
        const itemType =
          this.scopedTypeName(typeMap.value.typeMap, scope, optional) ??
          'interface{}';
        return wrap(`${JSII_API_ALIAS}.Slice[${itemType}]`);
      case 'map':
        const valueType =
          this.scopedTypeName(typeMap.value.typeMap, scope, optional) ??
          'interface{}';
        return wrap(`${JSII_API_ALIAS}.Map[${valueType}]`);
      case 'interface':
        const baseName = typeMap.value.name;
        // type is defined in the same scope as the current one, no namespace required
        if (scope.packageName === typeMap.value.namespace && baseName) {
          // if the current scope is the same as the types scope, return without a namespace
          return wrap(baseName);
        }

        // type is defined in another module and requires a namespace and import
        if (baseName) {
          return wrap(`${typeMap.value.namespace}.${baseName}`);
        }
        break;
      case 'union':
        return 'interface{}';
      case 'void':
        return '';
    }

    // type isn't handled
    throw new Error(
      `Type ${typeMap.value?.name} does not resolve to a known Go type.`,
    );

    function wrap(type: string): string {
      return optional ? `${JSII_API_ALIAS}.Option[${type}]` : type;
    }
  }
}
