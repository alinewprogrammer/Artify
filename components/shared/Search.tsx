"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { formUrlQuery, removeKeysFromQuery } from "@/lib/utils";

export const Search = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL so the input is prefilled after refresh / back navigation
  const initialQuery = (searchParams?.get("query") ?? "") as string;
  const [query, setQuery] = useState<string>(initialQuery);

  // Keep local input in sync when the URL changes externally (back/forward)
  useEffect(() => {
    const paramQuery = searchParams?.get("query") ?? "";
    if (paramQuery !== query) {
      setQuery(paramQuery);
    }
    // Intentionally only depend on searchParams so this runs on navigation changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced effect: update URL when query changes, resetting page to 1.
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const currentQueryInUrl = searchParams?.get("query") ?? "";

      // If query equals what's already in the URL, do nothing (avoid redundant pushes)
      if (query === currentQueryInUrl) return;

      if (query) {
        // Set query and reset page to 1
        // Use formUrlQuery util (keeps any other params intact) then ensure page=1
        let newUrl = formUrlQuery({
          searchParams: searchParams.toString(),
          key: "query",
          value: query,
        });

        // Ensure page=1 (if formUrlQuery doesn't support multi-key update)
        // We can rely on formUrlQuery keeping other params; add page=1 explicitly
        // If formUrlQuery already returns a full URL string (path + ?...), ensure we append/replace page param.
        try {
          const u = new URL(newUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
          u.searchParams.set("page", "1");
          newUrl = u.pathname + u.search;
        } catch {
          // fallback: attempt to set page using removeKeysFromQuery then append page=1
          const base = removeKeysFromQuery({
            searchParams: searchParams.toString(),
            keysToRemove: ["page"],
          });
          newUrl = formUrlQuery({
            searchParams: base.replace(/^\?/, ""),
            key: "query",
            value: query,
          });
          // ensure page=1 appended
          newUrl = newUrl.includes("?") ? `${newUrl}&page=1` : `${newUrl}?page=1`;
        }

        router.push(newUrl, { scroll: false });
      } else {
        // If query is empty, remove query AND page so user doesn't land on an out-of-range page
        const newUrl = removeKeysFromQuery({
          searchParams: searchParams.toString(),
          keysToRemove: ["query", "page"],
        });

        router.push(newUrl, { scroll: false });
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, router, searchParams]);

  return (
    <div className="search flex items-center gap-2">
      <Image src="/assets/icons/search.svg" alt="search" width={24} height={24} />

      <Input
        className="search-field"
        placeholder="Search"
        aria-label="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
};

export default Search;
