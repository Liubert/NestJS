<p align="center">
  <a href="https://nestjs.com" target="_blank">
    <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  Training project built with <a href="https://nestjs.com" target="_blank">NestJS</a>.
</p>

---

## 📦 Project Overview

This project was set up according to the initial assignment.  
The main goal was to get hands-on experience with core NestJS features and understand the request lifecycle.

---

## ✳️ What was done

- Created a **new User module** and basic project structure.
- Connected several **NestJS modules** required for the assignment.
- Added an **appConfig** file to manage environment variables.
- Worked with **DTO validation**:
    - used built-in validators,
    - added a **custom password validator**.
- Experimented with **guards**, **filters**, **interceptors**,  **transformation** and **middleware**.
 

---

## 🔍 Notes & Impressions

NestJS feels very modular and structured.  
There are many moving parts (modules, providers, guards, pipes, interceptors), and it takes time to understand how they all connect.

Even so, the framework looks practical and flexible.  
The structure reminds me of Angular (even though I haven’t worked much with Angular), and the module-based design seems useful for larger applications.

The current setup is just the beginning, but it provides a clear picture of how NestJS organizes backend logic.

---

## 🛠 Project Setup

```bash
npm install
npm run start:dev
Start PostgreSQL
docker start pg-ecom
docker run -d --name pg-ecom -p 5432:5432 postgres:15

Run migrations

Apply all database migrations:

npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
