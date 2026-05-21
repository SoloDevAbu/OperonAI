export interface Organization {
    id: string;
    name: string;
    slug: string;
    apiKey: string;
    createdAt: Date;
    updatedAt: Date;
  }
  
  export interface CreateOrganizationInput {
    name: string;
    slug: string;
  }