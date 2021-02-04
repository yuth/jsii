# Runtime Architecture
## Generated Libraries

When using `jsii-pacmak` to generate libraries in different programming
languages, the **Javascript** code is bundled within the generated library, so
that it can be used at runtime. This is the reason why a `node` runtime
needs to be available in order to execute code that depends on *jsii* libraries.

The generated libraries have a dependency on a *Runtime client* library for the
language, which contains the necessary logic to start a child `node` process
with the `jsii-runtime`. The `jsii-runtime` manages JSON-based inter-process
communication over its `STDIN`, `STDOUT` and `STDERR`, and manages a
`@jsii/kernel` instance that acts as a container for the **Javascript** code
that backs the *jsii* libraries.

## Architecture Overview

A representation of the execution environment of an application using *jsii*
libraries from a different language follows:

```
┌─────────────────────────┐               ┌────────────┬────┬────┬────┐
│                         │               │            │    │    │    │
│    Host Application     │               │@jsii/kernel│LibA│LibB│... │
│                         │               │            │    │    │    │
│      ┌──────────────────┤               ├────────────┴────┴────┴────┤
│      │                  │               │                           │
│      │Generated Bindings│               │       @jsii/runtime       │
│      │                  │               │                           │
│      ├──────────────────┤   Requests    ├──────┬────────────────────┤
│      │                  ├───────────────▶STDIN │                    │
│      │Host jsii Runtime │   Responses   ├──────┤                    │
│      │     Library      ◀───────────────┤STDOUT│                    │
│      │                  │    Console    ├──────┤    node            │
│      │                  ◀───────────────┤STDERR│                    │
├──────┴──────────────────┤               ├──────┘                    │
│      Host Runtime       │               │      (Child Process)      │
│  (JVM, .NET Core, ...)  │               │                           │
│                         │               │                           │
├─────────────────────────┴───────────────┴───────────────────────────┤
│                                                                     │
│                          Operating System                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Communication Protocol

As shown in the [architecture overview](#architecture-overview) diagram, the
`@jsii/runtime` process receives requests via its `STDIN` stream, sends
responses via its `STDOUT` stream, and sends console output through the `STDERR`
stream.

All those messages are sent in JSON-encoded objects. On `STDIN` and `STDOUT`,
the request-response protocol is defined by the [kernel api specification]. On
`STDERR` messages are encoded in the following way:

- `#!json { "stderr": "<base64-encoded data>" }` when the console data is to be
  written on the *Host Application*'s `STDERR` stream.
- `#!json { "stdout": "<base64-encoded data>" }` when the console data is to be
  written on the *Host Application*'s `STDOUT` stream.
- Any data that is not valid JSON, or that does not match either of the formats
  described avove must be written as-is on the *Host Application*'s `STDERR`
  stream.

[kernel api specification]: ../specification/3-kernel-api.md

In order to allow the hosted original **JavaScript** libraries to naturally
interact with `process.stdout`, `process.stderr` and all other APIs that make
use of those streams (such as `console.log` and `console.error`), the
`@jsii/runtime` process does in fact spawn a second `node` process to allow
intercepting the console data to properly encode it. Below is a diagram
describing the process arrangement that achieves this:

```
                                          ┌────────────┬────┬────┬────┐
                                          │            │    │    │    │
                                          │@jsii/kernel│LibA│LibB│... │
                                          │            │    │    │    │
┌─────────────────────────┐               ├────────────┴────┴────┴────┤
│                         │               │                           │
│  @jsii/runtime Wrapper  │               │    @jsii/runtime Core     │
│                         │               │                           │
├──────┬──────────────────┤               ├──────┬────────────────────┤
│STDIN │                  │        X──────▶STDIN │                    │
├──────┤                  │    Console    ├──────┤                    │
│STDOUT│                  ◀───────────────┤STDOUT│                    │
├──────┤                  │    Console    ├──────┤        node        │
│STDERR│   node           ◀───────────────┤STDERR│                    │
├──────┘                  │     JSON      ├──────┤  (Child Process)   │
│                         ◀───────────────▶ FD#3 │                    │
│                         │               ├──────┘                    │
│                         │               │                           │
├─────────────────────────┴───────────────┴───────────────────────────┤
│                                                                     │
│                          Operating System                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

!!! bug "Missing Feature"
    As shown on the diagram above, there is nothing connected to the *Core*
    process' `FD#0` (`STDIN`). This feature will be added in the future, but
    currently this means *jsii* libraries have no way of accepting input though
    `STDIN`.

The *Wrapper* process manages the *Core* process such that:

!!! info
    It would be possible to use a single `node` process (the *`@jsii/runtime`
    Core* process) for any platform that supposed spawning child processes with
    additional open file descriptors. This is for example not possible in
    **Java** and **C#**, which is why this dual-process contraption was devised.

    In such cases, the *Host Application* would spawn the *Core* process and
    directly operate on the file descriptors as described below.

- Any requests received from the *Host Application* through the *Wrapper*'s
  `STDIN` stream is forwarded to the *Core* process' `FD#3`.
- Any response written to the *Core*'s `FD#3` stream is forwarded to the *Host
  Application* though the *Wrapper*'s `STDOUT`.
- Any data sent to the *Core*'s `STDERR` is base64-encoded and wrapped in a JSON
  object with the `"stderr"` key, then forwarded to the *Host
  Application* through the *Wrapper*'s `STDERR`
- Any data sent to the *Core*'s `STDOUT` is base64-encoded and wrapped in a JSON
  object with the `"stdout"` key, then forwarded to the *Host
  Application* through the *Wrapper*'s `STDERR`

!!! danger
    As with any file descriptor besides `FD#0` (`STDIN`), `FD#1` (`STDOUT`) and
    `FD#2` (`STDERR`) that was not opened by the application, **JavaScript**
    libraries loaded in the `@jsii/kernel` instance are not allowed to interact
    directly with file descriptor `FD#3`.

### Initialization Process

The initialization workflow can be described as:

1. The *host* (**Java**, **.NET**, ...) application starts on its own runtime
    (JVM, .NET Runtime, ...)
2. When the *host* code encounters a *jsii* entity for the first time (creating
    an instance of a *jsii* type, loading a static constant, ...), the *runtime
    client library* creates a child `node` process, and loads the `jsii-runtime`
    library (specified by the `JSII_RUNTIME` environment variable, or the
    version that is bundled in the *runtime client library*)
3. The *runtime client library*  interacts with the child `node` process by
    exchanging JSON-encoded messages through the `node` process' *STDIN* and
    `STDOUT`. It maintains a thread (or equivalent) that decodes messages from
    the child's `STDERR` stream, and forwards the decoded data to it's host
    process' `STDERR` and `STDOUT` as needed.
4. The *runtime client library* automatically loads the **Javascript** modules
    bundled within the *generated bindings* (and their depedencies, bundled in
    other *generated bindings*) into the `node` process when needed.
5. Calls into the *Generated bindings* are encoded into JSON requests and sent
    to the child `node` process, which will execute the corresponding
    **Javascript** code, then responds back.
6. Upon exiting, the *host* process closes the communication channels with the
    child `node` process, causing it to exit.

## Event Loop

The `@jsii/kernel` implements an event loop described on the following diagram:

```plaintext
    ┌────────────────────┐
    │       hello        │
    └──────────┬─────────┘
               │
┌──────────────┤─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│              │
│   ┌──────────▼─────────┐     ┌────────────────────┐               │
│   │    Read Request    ├ ─ ─ ▶    process.exit    │
│   └──────────┬─────────┘     └────────────────────┘               │
│              │
│   ┌──────────▼─────────┐     ┌────────────────────┐    ┌──────────┴─────────┐
│   │  Process Request   ├ ─ ─ ▶      JS Impl.      ├ ─ ─▶      Callback      │
│   └──────────┬─────────┘     └────────────────────┘    └────────────────────┘
│              │
│   ┌──────────▼─────────┐     ┌────────────────────┐
│   │   Notifications    ├ ─ ─ ▶ Send Release Notif │
│   └──────────┬─────────┘     └────────────────────┘
│              │
│   ┌──────────▼─────────┐
│   │   Send Response    │
│   └──────────┬─────────┘
│              │
└──────────────┘
```

The sequence is as follows:

1. Once ready to accept request, emit the `hello` message
1. Read the next request from the input pipe

    * If that request is the `exit` call, gracefully terminates the `node`
      process using `process.exit(exitCode)` with the requested `exitCode`

1. Process the request

    * Most requests will involve calling into the **JavaScript** implementation
    * The **JavaScript** execution might need a _host_-defined `override` to be
      called, in which case, a `callback` request is immediately sent, and a
      nested event loop starts, and ends once it receives the `ok` response that
      provides the result of the `callback`.

1. Send any outstanding notifications

    * If any objects have become release-able by the _host runtime_, the
      [`release`](../../specification/3-kernel-api#release-objects) notification
      is emitted.

1. Send the response to the current request
1. Proceed to step `2.`, and process the next request

## Memory Management

In this architecture, two distinct processes interact with the same objects.
Each process uses a different execution engine, and the instances cannot be
directly shared between them. Instead, one process owns the "real" object, and
the other maintains a proxy object (which will forward method calls and property
accesses to the other process).

This indirection means that the two processes must coordinate in order to
correctly determine when an object's memory can be reclaimed. The mechanisms
described in the [specification](../specification) are used by each process to
let the other one know that no user-accessible references to the value exist:

- [Release notifications][release-notif] are emitted by the `@jsii/kernel` to
  let the _host runtime library_ know that it no longer has a user-accessible
  reference to certain objects.
- [`del` requests][del-request] are sent by the _host application_ when it no
  longer holds any reference to an object.

The process that originally creates an object is **responsible** for keeping
their copy of the object alive _at least_ until the other process has declared
they no longer hold user-accessible references to their corresponding proxy.

In particular:

- Objects created by the **JavaScript** execution, and passed over to the _host_
  are the responsibility of the `@jsii/kernel` process. The _host runtime_ may
  emit a [`del` request][del-request] without waiting for a
  [release notification][release-notif] to have been received for this instance.
- Objects created by the _host application_ are to be retained by the _host
  runtime_ until they have been part of a [release notification][release-notif].
  Only then can the _host runtime_ allow the memory for that object to be
  reclaimed, before emitting a [`del` request][del-request].

!!! danger
    Whenever an object created by the _host application_ is passed across to the
    `@jsii/kernel` process, an subsequent [release notification][release-notif]
    is needed, as new user-accessible references to the value may have been
    created. Consequently, whenever the `@jsii/kernel` emits a
    [release notification][release-notif], it is responsible to ensure it will
    not notify about objects that are referenced again.

[del-request]: ../../specification/3-kernel-api#destroying-objects
[release-notif]: ../../specification/3-kernel-api#release-objects
