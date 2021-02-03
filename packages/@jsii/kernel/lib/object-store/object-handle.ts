import { Type } from '@jsii/spec';
import { types } from 'util';

import { AnnotatedObjRef, TOKEN_INTERFACES, TOKEN_REF } from '../api';
import { InterfaceCollection } from '../interface-collection';
import { Sequence } from './sequence';

/* eslint-disable @typescript-eslint/ban-types */

/**
 * The referent object to an ObjectHandle.
 */
export type ReferentObject = { [key: string]: unknown };

/**
 * A registered handle to some object instance.
 */
export class ObjectHandle<T extends ReferentObject = ReferentObject> {
  /**
   * Retrieves the real referent object for the provided instance. If the
   * provided instance is a proxy created by `ObjectHandle`, the proxy's target
   * will be returned. Otherwise, `instance` will be returned as-is.
   *
   * @param instance the instance for which the referent is needed.
   */
  public static realObject<T extends object>(instance: T): T {
    if (types.isProxy(instance)) {
      const ownProp = Object.getOwnPropertyDescriptor(
        instance,
        RealObjectProxyHandler.realObjectSymbol,
      );
      return ownProp?.value ?? instance;
    }
    return instance;
  }

  /**
   * The fully qualified class name this object is an instance of.
   */
  public readonly classFQN: string;
  /**
   * The instance ID assigned to this object handle.
   */
  public readonly instanceId: string;

  /** The object this is a handle for. */
  private readonly object: T;
  /** The finalization registry. */
  private readonly finalizationRegistry: FinalizationRegistry;

  /** A proxy reference to be used in place of the `object`. */
  private proxyReference?: WeakRef<T>;

  /** The list of interfaces declared on this object. */
  private readonly declaredInterfaces: Set<string>;
  /** The collection of interfaces indirectly implemented by this object. */
  private readonly providedInterfaces: InterfaceCollection;

  /**
   * Creates a new `ObjectHandle`.
   *
   * @param opts the necessary information to create the `ObjectHandle`.
   */
  public constructor(opts: ObjectHandleOptions<T>) {
    this.classFQN = opts.classFQN;
    this.instanceId = `${opts.classFQN}@${opts.sequence.next()}`;

    this.object = opts.instance;
    this.finalizationRegistry = opts.finalizationRegistry;

    this.declaredInterfaces = new Set(opts.interfaceFQNs);
    this.providedInterfaces = new InterfaceCollection(
      opts.resolveType,
      opts.classFQN,
    );
    for (const fqn of this.declaredInterfaces) {
      this.providedInterfaces.addFromInterface(fqn);
    }
    for (const fqn of this.providedInterfaces) {
      this.declaredInterfaces.delete(fqn);
    }
  }

  /**
   * @returns `true` if this instance has a bound proxy, meaning there may still
   *          be reachable references to the proxy somewhere.
   */
  public get hasProxy() {
    return this.proxyReference?.deref() != null;
  }

  /**
   * The list of interfaces directly implemented by this object.
   */
  public get interfaces(): readonly string[] {
    return Array.from(this.declaredInterfaces).sort();
  }

  /**
   * @returns the `AnnotatedObjectRef` for this instance.
   */
  public get objRef(): AnnotatedObjRef {
    const interfaces = this.interfaces;
    return {
      [TOKEN_INTERFACES]: interfaces.length > 0 ? interfaces : undefined,
      [TOKEN_REF]: this.instanceId,
    };
  }

  /**
   * Creates a strong reference to the referent of this `ObjectHandle`.
   *
   * @returns a proxy to the value held by this `ObjectReference`.
   */
  public get proxy(): T {
    const existing = this.proxyReference?.deref();
    if (existing != null) {
      return existing;
    }
    const proxy = new Proxy(
      this.object,
      new RealObjectProxyHandler<T>(this.object),
    );
    this.finalizationRegistry.register(proxy, this);
    this.proxyReference = new WeakRef(proxy);
    return proxy;
  }

  /**
   * Merges the provided interfaces into this `ObjectHandle`'s declared
   * interfaces, removing any redundant declarations.
   *
   * @param interfaceFQNs the list of interfaces to merge in.
   */
  public mergeInterfaces(interfaceFQNs: readonly string[]): void {
    if (interfaceFQNs.length === 0) {
      return;
    }

    for (const fqn of interfaceFQNs) {
      this.providedInterfaces.addFromInterface(fqn);
      this.declaredInterfaces.add(fqn);
    }

    for (const fqn of this.providedInterfaces) {
      this.declaredInterfaces.delete(fqn);
    }
  }
}

/**
 * Options for creating a new `ObjectHandle`.
 */
export interface ObjectHandleOptions<T extends object> {
  /**
   * The fully qualified type name for this object. Might be `Object` if the
   * instance is of an "anonymous" type.
   */
  readonly classFQN: string;

  /**
   * The finalization registry on which new proxies will be registered. The
   * held value will be set to the `ObjectHandle` instance that created the
   * proxy.
   */
  readonly finalizationRegistry: FinalizationRegistry;

  /**
   * The instance (might be a proxy to a foreign-owned object, according to the
   * value of the `owner` property) that is tracked.
   */
  readonly instance: T;

  /**
   * The fully qualified type name for interfaces this object implements. It is
   * not necessary for the value to specify transitively implemented interfaces,
   * whether they are inherited from the class referred to by `classFQN`, or by
   * another entry in the `interfaceFQNs` list.
   */
  readonly interfaceFQNs: readonly string[];

  /**
   * A function that can resolve a jsii type given it's fully qualified name.
   */
  readonly resolveType: (fqn: string) => Type;

  /**
   * The sequence to sue when generating instance IDs.
   */
  readonly sequence: Sequence;
}

/**
 * A proxy handler that adds a real object symbol property to the proxy value,
 * and returns the provided `realObject` value.
 */
class RealObjectProxyHandler<T extends object> implements ProxyHandler<T> {
  /** The symbol proxies use to trakc their target. */
  public static readonly realObjectSymbol = Symbol('ObjectHandle::object');

  public constructor(private readonly realObject: T) {}

  public getOwnPropertyDescriptor(
    target: T,
    property: PropertyKey,
  ): PropertyDescriptor | undefined {
    // Inserts the additional property.
    if (property === RealObjectProxyHandler.realObjectSymbol) {
      return {
        configurable: false,
        enumerable: false,
        value: this.realObject,
        writable: false,
      };
    }
    return Object.getOwnPropertyDescriptor(target, property);
  }
}
