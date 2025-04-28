import React, { useEffect, useState } from "react";
import {
  reactExtension,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useApi,
  useMetafield,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { query, i18n } = useApi();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState({});
  const [showError, setShowError] = useState(false);
  const lines = useCartLines();
  
  // Use metafield to get collection handle
  const metafield = useMetafield({
    namespace: "custom",
    key: "upsell_collection",
  });

  useEffect(() => {
    async function fetchProducts() {
      try {
        // First try to use collection handle from metafield
        if (metafield?.value) {
          try {
            const collectionHandle = metafield.value.trim();
            const { data } = await query(
              `query ($handle: String!, $first: Int!) {
                collection(handle: $handle) {
                  products(first: $first) {
                    nodes {
                      id
                      title
                      images(first: 1) {
                        nodes {
                          url
                        }
                      }
                      variants(first: 1) {
                        nodes {
                          id
                          price {
                            amount
                          }
                          availableForSale
                        }
                      }
                    }
                  }
                }
              }`,
              {
                variables: {
                  handle: collectionHandle,
                  first: 5,
                },
              }
            );
            if (data?.collection?.products?.nodes) {
              setProducts(data.collection.products.nodes);
              return;
            }
          } catch (e) {
            console.error("Error fetching collection products:", e);
          }
        }

        // Fallback to general products query
        const { data } = await query(
          `query ($first: Int!) {
            products(first: $first) {
              nodes {
                id
                title
                images(first: 1) {
                  nodes {
                    url
                  }
                }
                variants(first: 1) {
                  nodes {
                    id
                    price {
                      amount
                    }
                    availableForSale
                  }
                }
              }
            }
          }`,
          { variables: { first: 5 } }
        );
        setProducts(data?.products?.nodes || []);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [query, metafield]);

  async function handleAddToCart(variantId) {
    setAdding((prev) => ({ ...prev, [variantId]: true }));
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setAdding((prev) => ({ ...prev, [variantId]: false }));
    if (result.type === "error") {
      setShowError(true);
      console.error(result.message);
    }
  }

  if (loading) {
    return (
      <BlockStack spacing="loose">
        <Divider />
        <Heading level={2}>You might also like</Heading>
        <BlockStack spacing="loose">
          {[...Array(3)].map((_, index) => (
            <InlineLayout key={index} spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
              <SkeletonImage aspectRatio={1} />
              <BlockStack spacing="none">
                <SkeletonText inlineSize="large" />
                <SkeletonText inlineSize="small" />
              </BlockStack>
              <Button kind="secondary" disabled={true}>
                Add
              </Button>
            </InlineLayout>
          ))}
        </BlockStack>
      </BlockStack>
    );
  }

  const productsOnOffer = getProductsOnOffer(lines, products);

  if (!productsOnOffer.length) {
    return null;
  }

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        {productsOnOffer.map((product) => {
          const variant = product.variants.nodes[0];
          if (!variant?.availableForSale) return null;
          
          return (
            <InlineLayout key={product.id} spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
              <Image
                border="base"
                borderWidth="base"
                borderRadius="loose"
                source={product.images.nodes[0]?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081"}
                accessibilityDescription={product.title}
                aspectRatio={1}
              />
              <BlockStack spacing="none">
                <Text size="medium" emphasis="bold">
                  {product.title}
                </Text>
                <Text appearance="subdued">{i18n.formatCurrency(variant.price.amount)}</Text>
              </BlockStack>
              <Button
                kind="secondary"
                loading={adding[variant.id] || false}
                accessibilityLabel={`Add ${product.title} to cart`}
                onPress={() => handleAddToCart(variant.id)}
              >
                Add
              </Button>
            </InlineLayout>
          );
        })}
      </BlockStack>
      {showError && (
        <Banner status="critical">
          There was an issue adding this product. Please try again.
        </Banner>
      )}
    </BlockStack>
  );
}

function getProductsOnOffer(lines, products) {
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id);
  return products.filter((product) => {
    return product.variants.nodes.some(variant => 
      variant.availableForSale && 
      !cartLineProductVariantIds.includes(variant.id)
    );
  });
}