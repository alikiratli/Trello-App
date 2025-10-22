import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          Create Trello tickets without leaving Shopify
        </h1>
        <p className={styles.text}>
          Turn incoming storefront or support signals into actionable Trello
          cards in a couple of clicks.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Capture context instantly</strong>. Add rich descriptions,
            due dates, and Shopify links to every Trello card.
          </li>
          <li>
            <strong>Target the right list</strong>. Pull your Trello board lists
            dynamically so cards land in the right backlog.
          </li>
          <li>
            <strong>Stay secure</strong>. Keep Trello credentials in server-side
            environment variables only you control.
          </li>
        </ul>
      </div>
    </div>
  );
}
