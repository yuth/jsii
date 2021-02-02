import {
  describeTypeReference,
  isClassType,
  isInterfaceType,
  Type,
} from '@jsii/spec';

import { EMPTY_OBJECT_FQN } from './serialization';

/**
 * A facility to obtain a set of interface FQNs that are transitively granted by
 * the provided types. This is helpful to create a set of itnerfaces that does
 * not include redundant declarations.
 */
export class InterfaceCollection implements Iterable<string> {
  private readonly interfaces = new Set<string>();

  public constructor(
    private readonly resolveType: (fqn: string) => Type,
    classFQN: string = EMPTY_OBJECT_FQN,
  ) {
    if (classFQN !== EMPTY_OBJECT_FQN) {
      this.addFromClass(classFQN);
    }
  }

  public addFromInterface(fqn: string): void {
    const ti = this.resolveType(fqn);
    if (!isInterfaceType(ti)) {
      throw new Error(
        `Expected an interface, but received ${describeTypeReference(ti)}`,
      );
    }
    if (!ti.interfaces) {
      return;
    }
    for (const iface of ti.interfaces) {
      if (this.interfaces.has(iface)) {
        continue;
      }
      this.interfaces.add(iface);
      this.addFromInterface(iface);
    }
  }

  public [Symbol.iterator]() {
    return this.interfaces[Symbol.iterator]();
  }

  private addFromClass(fqn: string): void {
    const ti = this.resolveType(fqn);
    if (!isClassType(ti)) {
      throw new Error(
        `Expected a class, but received ${describeTypeReference(ti)}`,
      );
    }
    if (ti.base) {
      this.addFromClass(ti.base);
    }
    if (ti.interfaces) {
      for (const iface of ti.interfaces) {
        if (this.interfaces.has(iface)) {
          continue;
        }
        this.interfaces.add(iface);
        this.addFromInterface(iface);
      }
    }
  }
}
