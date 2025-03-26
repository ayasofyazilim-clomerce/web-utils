export interface MyUser {
  //user
  userName: string;
  email: string;
  name: string;
  surname: string;
  role: string;

  //tenant
  tenantId?: string;
  tenantName?: string;

  refresh_token: string;
  access_token: string;
  expiration_date: number;
}

export type {Session} from "next-auth";
