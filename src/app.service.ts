import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
    <html>
      <head><title>About</title></head>
      <body>
        <h1>Liubomyr Fedyshyn</h1>
        <p>NestJS student</p>
        <ul>
          <li>Email: <a href="mailto:lybert19@gmail.com">lybert19@gmail.com</a></li>
          <li>Repo: <a href="https://github.com/Liubert/NestJS">NestJS-repo</a></li>
        </ul>
      </body>
    </html>
  `;
  }
}
