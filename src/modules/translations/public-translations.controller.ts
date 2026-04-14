import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';
import { TranslationsService } from './translations.service.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { LOCALE_REGISTRY } from './locale-registry.js';

/**
 * Public (Locize-compatible) routes for serving translations to client apps.
 *
 * IMPORTANT: This controller uses wildcard route params and MUST be registered
 * LAST in the module's controllers array to avoid intercepting requests meant
 * for other controllers (webhooks, sandbox, etc.).
 */
// Higher rate limit for public i18n routes — frontend apps poll frequently.
// Global default is 300/min; public reads get 3000/min to avoid blocking
// legitimate traffic while still protecting against abuse.
@Throttle({ default: { ttl: seconds(60), limit: 3000 } })
@ApiTags('translations (public)')
@Controller('translations')
export class PublicTranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly sandboxService: SandboxService,
  ) {}

  @Get('supported-locales')
  @ApiOperation({ summary: 'List all supported locales with metadata' })
  getSupportedLocales() {
    return LOCALE_REGISTRY;
  }

  @Get(':projectSlug/locales')
  @ApiOperation({ summary: 'Get all supported locales for a project' })
  async getLocales(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getLocales(projectSlug);
  }

  @Get(':projectSlug/namespaces')
  @ApiOperation({ summary: 'Get all namespaces for a project' })
  async getNamespaces(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getNamespaces(projectSlug);
  }

  @Get(':projectSlug/:namespace/:locale')
  @ApiOperation({
    summary:
      'Get translations for a namespace and locale (Locize-compatible). Pass ?env=sandbox for sandbox data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Flat key-value translation object',
  })
  async getNamespace(
    @Param('projectSlug') projectSlug: string,
    @Param('namespace') namespace: string,
    @Param('locale') locale: string,
    @Query('env') env: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (env === 'sandbox') {
      const translations = await this.sandboxService.getSandboxNamespace(
        projectSlug,
        namespace,
        locale,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json(translations);
      return;
    }

    const translations = await this.translationsService.getNamespace(
      projectSlug,
      namespace,
      locale,
    );
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(translations);
  }
}
