# Memory Management

* Status: in-progress
* Deciders: @RomainMuller
* Date: 2021-02-03

## Context and Problem Statement

So far, *jsii* applications leaked all allocations forever, as instances managed
by the `@jsii/kernel` and _host runtime libraries_ were made permanently
ineligible for garbage collection. This resulted in negative experiences and
performance impact in high-churn applications.

## Decision Drivers

As most high-level languages nowadays feature automatic memory management
(using garbage collection techniques, automated reference counting, etc...),
consumers of *jsii* libraries in such languages should not need to think about
memory management (this would be a breach of idiomacy).

The problem is constrained to *jsii managed objects*: objects that have been
shared by reference across the process boundary between the _host application_
and the `@jsii/kernel`. Those objects are allocated an instance ID (also
referred to as an object ID).

There are exactly two ways an object can become *managed*:

1. The _host application_ creates *managed objects* by sending `create` requests
   to the `@jsii/kernel`.

1. The `@jsii/kernel` enrolls arbitrary objects into *management* upon passing
   those to the _host application_ (as the return value of an `invoke` request,
   as a parameter to a `callback`, etc...).

This allows for some convenient simplifications in the kind of coordination that
is needed in order to maintain consistency between the two processes:

* The _host application_ only needs to actively retain *managed objects* that it
  created through the `create` request. These object's full implementation is
  spread across both processes, and they cannot be easily re-constructed.

    - In this document, we will treat all *managed objects* originating from the
      `create` request the same way, regardless of whether they carry _host_
      `overrides` or not.
    - It would be possible to threat *managed objects* created without
      `overrides` the same as objects created in **JavaScript**, as those are
      pure proxies that can readily be re-created. This however complicates the
      management code (both the `@jsii/kernel` and _host runtime library_ have
      to fork the management logic accordinly) for little benefit.

* All other *managed objects* have they entire state and behavior defined in
  **JavaScript**, and new _proxy_ values for those can be created in the _host
  application_ at any time.

    - The trade-off to creating new proxies is only allocation churn. This cost
      is largely acceptable, in particular as garbage-collected runtimes may not
      recclaim memory very eagerly, unless the application runs very close to
      the heap size limit.
    - Loss of referential identity is actually not an issue: if the _host
      application_ has let a previous proxy instance be reclaimed by the garbage
      collector, that value is no longer there to be compared with.

* The `@jsii/kernel` however must keep all instances around until they are
  targetted by a `del` request.

Below is a diagram representing the shared rechability state machie described
above (`User` means the reference may be user-accessible, and implies it is
kernel-accessible; whereas `Kernel` means the reference is **known** to _only_
be accesible from within the object manager):

```paintext
                     ┌ ─ ─ ─ ─ ─ ─ ─
                          create    │
                     └ ─ ─ ─ ┬ ─ ─ ─
                             │
                    ┏━━━━━━┳━▼━━━━━━━┓
                    ┃  JS     User   ┃
                    ┣──────┼─────────◀────────────┐
                    ┃ Host    User   ┃            │
                    ┗━━━━━━┻━┳━━━━━━━┛            │
                             │                    │
┌ ─ ─ ─ ─ ─ ─ ─              │                    │
    From JS    │      Release Notif          Sent to JS
└ ─ ─ ─ ┬ ─ ─ ─              │                    │
        │                    │                    │
        │           ┏━━━━━━┳━▼━━━━━━━┓            │
        │           ┃  JS    Kernel  ┃            │
        └───────────▶──────┼─────────╋────────────┘
                    ┃ Host    User   ┃
                    ┗━━━━━━┻━┳━━━━━━━┛
                             │
                             │
                        Reclaimed
                             │
                             │
                    ┏━━━━━━┳━▼━━━━━━━┓
                    ┃  JS    Kernel  ┃
                    ┣──────┼─────────┫
                    ┃ Host   Kernel  ┃
                    ┗━━━━━━┻━┳━━━━━━━┛
                             │
                             │
                           del
                             │
                             │
                    ┏━━━━━━┳━▼━━━━━━━┓
                    ┃  JS            ┃
                    ┣──────┼─────────┫
                    ┃ Host           ┃
                    ┗━━━━━━┻━━━━━━━━━┛
```

## Solution

### JavaScript (`@jsii/kernel`)

Starting with `node 14.6.0`, the [`WeakRef`][WeakRef] and
[`FinalizationRegistry`][FinalizationRegistry] classes have been de-flagged
(they have been available since `node 13.0.0` under the `--harmony-weak-refs`
runtime flag). These facilities combined allow the `@jsii/kernel` to interface
with the `node` garbage collection mechanism to notify about object lifecycle
events.

In order to be able to distinguish between a user-accessible reference from one
that is only reachable by the `@jsii/kernel`, objects managed by the
`@jsii/kernel` will be kept tightly in the kernel itself, while [`Proxy`][proxy]
objects will be used by the user code.

This way, the `@jsii/kernel` can keep [weak references][WeakRef] on the
[`Proxy`][proxy], and leveraging a [`FinalizationRegistry`][FinalizationRegistry]
to be notified of when no more user-land references exist, adding the instance
ID to the list of references that are no longer user-reachable.

The same [`Proxy`][proxy] object will be re-used until it is garbage-collected,
at which point either the object will be deleted by the _host application_, or
a new [`Proxy`][proxy] will be created as a new user-accessible reference to the
value is created.

[FinalizationRegistry]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry
[Proxy]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
[WeakRef]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef

### Host Runtimes

The _host runtime libraries_ work in tandem with the `@jsii/kernel`. Managed
objects are internally tracked with a pair of references:

- a _weak reference_ is always held, and leveraged to determine when a value has
  been reclaimed by the garbage collector
- a _strong reference_ is maintained for objects that were created by the _host
  application_ (this excludes objects that were created within **JavaScript**
  calls, then passed across the process boundary), until the `@jsii/kernel`
  notified the absence of any user-accessile reference to the value.

Once objects are reclaimed by the garbage collector (implying they are no longer
user-accessible in the **JavaScript** agent), the _host runtime_ will message
the `@jsii/kernel` process to finally un-manage the reference.

### Messaging

A new `notification` message is added to the `@jsii/kernel` API. Notifications
may be emitted by the `@jsii/kernel` process prior to sending the response to a
request; those are processed by the _host runtime library_ as soon as they are
received.

The only supported notification at this stage is the `release` notification,
which the `@jsii/kernel` uses to inform the _host runtime library_ that it no
longer holds any user-accessible reference to a set of objects. The _host_ uses
this information to drop the _strong reference_ it holds on those objects,
allowing them to be garbage collected, and eventually allowing the `del` request
to be sent to the `@jsii/kernel` for those objects.

Whanever the _host runtime_ passes an object reference back to the
`@jsii/kernel`, it must restore a _strong reference_ to the object, and retain
this until the object is part of a new `release` notification.

## Links

- [Kernel API Specification](../../specification/3-kernel-api)

    - [`release` notification](../../specification/3-kernel-api#release-objects)
    - [`del` request](../../specification/3-kernel-api#destroying-objects)

- [Runtime Architecture](../../overview/runtime-architecture)

    - [Event Loop](../../overview/runtime-architecture#event-loop)
