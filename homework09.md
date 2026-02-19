# Homework 9 — AWS S3

## Питання: Який домен інтегрували (Users чи Products)?

I chose the Users domain and implemented avatar upload. 
However, a better example for this task would have been receipts or other private documents, since avatars are typically public.

---

## Питання: Як працює presign → upload → complete?

The flow consists of three steps.
First, the backend generates an S3 key and creates a FileRecord with status pending.
Second, the client uploads the file directly to S3.
Third, the backend verifies the file via S3 HEAD, validates metadata, switches status to ready, and attaches it to the user.

---

## Питання: Як реалізовані перевірки доступу?

Access control is implemented using JWT authentication and role-based authorization (USER, ADMIN). Additionally, ownership validation ensures that users can operate only on their own files. This prevents horizontal privilege escalation and enforces strict data isolation.
 
## Питання: Як формується URL для перегляду?

The file URL is generated dynamically. In development, a presigned GET URL is returned to keep the S3 bucket private and restrict access by time.