import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data: personalityRows, error: personalitiesError } =
      await supabaseAdmin
        .from("personalities")
        .select(`
          id,
          canonical_name,
          personality_categories (
            is_primary,
            categories (
              id,
              slug,
              name
            )
          )
        `)
        .order("canonical_name");

    if (personalitiesError) throw personalitiesError;

    const personalities = (personalityRows || []).map((person: any) => {
      const memberships = person.personality_categories || [];

      const primaryMembership =
        memberships.find((membership: any) => membership.is_primary) ||
        memberships[0];

      let category = primaryMembership?.categories || null;

      if (Array.isArray(category)) {
        category = category[0] || null;
      }

      return {
        id: person.id,
        canonical_name: person.canonical_name,
        category_id: category?.id || null,
        category_slug: category?.slug || null,
        category_name: category?.name || null,
      };
    });

    const { data: categories, error: categoriesError } =
      await supabaseAdmin
        .from("categories")
        .select(`
          id,
          slug,
          name,
          parameters (
            id,
            code,
            name,
            sort_order,
            parameter_fields (
              id,
              code,
              label,
              sort_order
            )
          )
        `)
        .order("name");

    if (categoriesError) throw categoriesError;

    const { data: sources, error: sourcesError } =
      await supabaseAdmin
        .from("sources")
        .select("id, title, author, source_type, source_status")
        .order("title");

    if (sourcesError) throw sourcesError;

    return NextResponse.json({
      personalities,
      categories,
      sources,
    });
  } catch (error: any) {
    console.error("Options error:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to load research data.",
      },
      { status: 500 }
    );
  }
}
