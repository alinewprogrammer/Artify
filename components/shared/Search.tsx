"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { formUrlQuery, removeKeysFromQuery } from "@/lib/utils";

export const Search = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsString = searchParams?.toString() ?? "";

  // initialize from the current search param 'query'
  const initial = (() => {
    try {
      return searchParams?.get("query") ?? "";
    } catch {
      return "";
    }
  })();

  const [query, setQuery] = useState<string>(initial);

  useEffect(() => {
    // keep local state in sync if URL changes externally (but do not overwrite user's typing)
    const urlQuery = searchParams?.get("query") ?? "";
    if (urlQuery !== query) {
      setQuery(urlQuery);
    }
    // we only want to run when the underlying params string changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsString]);

  useEffect(() => {
    // prevent pushing if URL already matches current query
    const currentUrlQuery = new URLSearchParams(paramsString).get("query") ?? "";
    if (currentUrlQuery === query) return;

    const id = window.setTimeout(() => {
      if (query) {
        const newUrl = formUrlQuery({
          searchParams: paramsString,
          key: "query",
          value: query,
        });
        router.push(newUrl, { scroll: false });
      } else {
        const newUrl = removeKeysFromQuery({
          searchParams: paramsString,
          keysToRemove: ["query"],
        });
        router.push(newUrl, { scroll: false });
      }
    }, 300);

    return () => window.clearTimeout(id);
  }, [paramsString, query, router]);

  return (
    <div className="search">
      <Image src="/assets/icons/search.svg" alt="search" width={24} height={24} />

      <Input
        className="search-field"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search"
      />
    </div>
  );
};
