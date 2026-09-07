import type {
  Volo_Abp_AspNetCore_Mvc_ApplicationConfigurations_ApplicationConfigurationDto,
} from "@repo/core-saas/AccountService";
import type {
  UniRefund_AdministrationService_CountrySettings_CountrySettingInfoDto,
} from "@repo/core-saas/AdministrationService";

export type RawApplicationConfiguration =
  Volo_Abp_AspNetCore_Mvc_ApplicationConfigurations_ApplicationConfigurationDto;

export type CountryInfo =
  UniRefund_AdministrationService_CountrySettings_CountrySettingInfoDto;

export interface ApplicationConfigurationUser {
  isAuthenticated: boolean;
  id: string | null;
  userName: string | null;
  name: string | null;
  surName: string | null;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  /** ABP identity roles (e.g. ["admin"]) — NOT a CRM party type. */
  roles: string[];
  sessionId: string | null;
}

export interface ApplicationConfigurationTenant {
  id: string | null;
  name: string | null;
  isAvailable: boolean;
  isHost: boolean;
}

export interface ApplicationConfigurationCountry {
  currency: string;
  countryCode2: string | null;
  countryCode3: string | null;
  countryName: string | null;
}

export interface ApplicationConfiguration {
  user: ApplicationConfigurationUser;
  tenant: ApplicationConfigurationTenant;
  country: ApplicationConfigurationCountry;
  /** IANA, e.g. "Europe/London". Never a Windows zone id. */
  timeZone: string;
  policies: Record<string, boolean>;
  settings: Record<string, string | null>;
  features: Record<string, string | null>;
}
