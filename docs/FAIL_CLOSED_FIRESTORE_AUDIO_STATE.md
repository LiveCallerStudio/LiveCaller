# Fail-closed Firestore state transitions

The Firestore adapter now treats the on-air document write as part of the safety boundary. If the producer can switch a caller into program audio but cannot persist that caller's `on-air` state, the adapter immediately asks the media controller to hold that caller and then rethrows the original write error.

Hold transitions silence program routing before persisting `on-hold`. If that write fails, the call remains held rather than being reopened optimistically.

This does not solve offline Firestore or deployed security-rule issues. It limits the damage from a failed state write and includes a mocked failure test.
