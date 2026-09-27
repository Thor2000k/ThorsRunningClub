import "../src/styles.css";

export const metadata = {
  title: "Thor’s Running Club",
  description: "Find your next run in Copenhagen.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
