"use client";
import { ChakraBaseProvider, extendBaseTheme } from "@chakra-ui/react";
import { theme as baseTheme } from "@chakra-ui/theme";
import { type StyleFunctionProps, mode } from "@chakra-ui/theme-tools";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { type FC, type PropsWithChildren, useState } from "react";
import { createEmotionRegistry } from "@/util/emotion";

const {
  Button,
  Card,
  Container,
  Divider,
  Editable,
  Form,
  FormError,
  FormLabel,
  Heading,
  Input,
  NumberInput,
  Spinner,
  Textarea,
  Tooltip,
  Stepper,
} = baseTheme.components;

const theme = extendBaseTheme({
  config: {
    initialColorMode: "system",
    useSystemColorMode: true,
  },
  styles: {
    global: (props: Record<string, unknown> | StyleFunctionProps) => ({
      body: {
        bg: mode("gray.100", "gray.800")(props),
      },
    }),
  },
  components: {
    Button,
    Textarea,
    Container,
    Card,
    Divider,
    Form,
    FormError,
    FormLabel,
    NumberInput,
    Tooltip,
    Input,
    Heading,
    Editable,
    Spinner,
    Stepper,
  },
});

/**
 * Without an explicit cache, Emotion server-renders each style as an inline
 * <style> in <body>, and its default cache moves those tags into <head> when
 * @emotion/react is first evaluated on the client. That can happen after React
 * has started hydrating <body>, leaving React pointed at a <style> that is no
 * longer there: React error #418 on a fraction of page loads. This registry
 * sends the SSR styles through useServerInsertedHTML instead, so they never
 * sit among the elements React hydrates.
 */
const EmotionCacheProvider: FC<PropsWithChildren> = ({ children }) => {
  const [registry] = useState(createEmotionRegistry);
  useServerInsertedHTML(() => {
    const tags = registry.flush();
    if (tags.length === 0) {
      return null;
    }
    return tags.map(({ dataEmotion, css }) => (
      <style
        key={dataEmotion}
        data-emotion={dataEmotion}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS that Emotion generated from our theme, not user input
        dangerouslySetInnerHTML={{ __html: css }}
      />
    ));
  });
  return <CacheProvider value={registry.cache}>{children}</CacheProvider>;
};

export const Providers: FC<PropsWithChildren> = ({ children }) => {
  return (
    <EmotionCacheProvider>
      <ChakraBaseProvider theme={theme}>{children}</ChakraBaseProvider>
    </EmotionCacheProvider>
  );
};
