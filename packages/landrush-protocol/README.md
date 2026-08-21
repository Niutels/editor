# @landrush/protocol

Versioned, renderer-independent wire contracts shared by the Landrush browser client and
multiplayer server. Pascal scene nodes cross this boundary as payloads; Landrush owns their
revision, operation identity, conflict handling, and persistence envelope.

Parcel-build schema 2 writes include a writer session ID and server-issued writer epoch. Servers
may still broadcast schema-1 snapshots for deterministic migration, but reject schema-1 writes so
an older client cannot erase schema-2 parcel graph roots. Successful sender acknowledgement uses
`parcel-build-nodes-ack`, which carries only transport metadata; build content is delivered through
world snapshots, remote updates, or explicit conflicts.
