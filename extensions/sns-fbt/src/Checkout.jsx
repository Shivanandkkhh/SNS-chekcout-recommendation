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
  Select,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { query, i18n } = useApi();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState({});
  const [showError, setShowError] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [showVariantSelectors, setShowVariantSelectors] = useState({});
  const lines = useCartLines();
  
  const metafield = useMetafield({
    namespace: "custom",
    key: "upsell_product_checkout",
  });

  useEffect(() => {
    async function fetchProducts() {
      try {
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
                      variants(first: 10) {
                        nodes {
                          id
                          title
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
              const initialSelected = {};
              data.collection.products.nodes.forEach(product => {
                if (product.variants.nodes.length > 0) {
                  const availableVariant = product.variants.nodes.find(v => v.availableForSale);
                  if (availableVariant) {
                    initialSelected[product.id] = availableVariant.id;
                  }
                }
              });
              setSelectedVariants(initialSelected);
              return;
            }
          } catch (e) {
            console.error("Error fetching collection products:", e);
          }
        }

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
                variants(first: 10) {
                  nodes {
                    id
                    title
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
        const initialSelected = {};
        data?.products?.nodes.forEach(product => {
          if (product.variants.nodes.length > 0) {
            const availableVariant = product.variants.nodes.find(v => v.availableForSale);
            if (availableVariant) {
              initialSelected[product.id] = availableVariant.id;
            }
          }
        });
        setSelectedVariants(initialSelected);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [query, metafield]);

  async function handleAddToCart(productId) {
    const variantId = selectedVariants[productId];
    if (!variantId) return;
    
    setAdding((prev) => ({ ...prev, [productId]: true }));
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setAdding((prev) => ({ ...prev, [productId]: false }));
    if (result.type === "error") {
      setShowError(true);
      console.error(result.message);
    }
  }

  function handleVariantChange(productId, variantId) {
    setSelectedVariants(prev => ({
      ...prev,
      [productId]: variantId
    }));
  }

  function toggleVariantSelector(productId) {
    setShowVariantSelectors(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
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
              <Button appearance="critical" kind="secondary" disabled={true}>
                Add
              </Button>
            </InlineLayout>
          ))}
        </BlockStack>
      </BlockStack>
    );
  }

  const productsOnOffer = getProductsOnOffer(lines, products, selectedVariants);

  if (!productsOnOffer.length) {
    return null;
  }

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        {productsOnOffer.map((product) => {
          const availableVariants = product.variants.nodes.filter(v => v.availableForSale);
          if (availableVariants.length === 0) return null;
          
          const selectedVariantId = selectedVariants[product.id];
          const selectedVariant = availableVariants.find(v => v.id === selectedVariantId) || availableVariants[0];
          const hasMultipleVariants = availableVariants.length > 1;
          const showSelector = showVariantSelectors[product.id];

          return (
            <BlockStack key={product.id} spacing="base">
              <InlineLayout spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
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
                  <Text appearance="critical">{i18n.formatCurrency(selectedVariant.price.amount)}</Text>
                </BlockStack>
                
                {hasMultipleVariants ? (
                  showSelector ? (
                    <Button
                      kind="secondary"
                      appearance="critical"
                      loading={adding[product.id] || false}
                      accessibilityLabel={`Add ${product.title} to cart`}
                      onPress={() => {
                        handleAddToCart(product.id);
                        toggleVariantSelector(product.id);
                      }}
                    >
                      Add
                    </Button>
                  ) : (
                    <Button
                      kind="secondary"
                      appearance="critical"
                      onPress={() => toggleVariantSelector(product.id)}
                    >
                      Options
                    </Button>
                  )
                ) : (
                  <Button
                    kind="secondary"
                    appearance="critical"
                    loading={adding[product.id] || false}
                    accessibilityLabel={`Add ${product.title} to cart`}
                    onPress={() => handleAddToCart(product.id)}
                  >
                    Add
                  </Button>
                )}
              </InlineLayout>
              
              {hasMultipleVariants && showSelector && (
                <Select
                  value={selectedVariantId}
                  onChange={(value) => handleVariantChange(product.id, value)}
                  options={availableVariants.map(variant => ({
                    value: variant.id,
                    label: variant.title === 'Default Title' ? 'Default' : variant.title
                  }))}
                />
              )}
            </BlockStack>
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

function getProductsOnOffer(lines, products, selectedVariants) {
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id);
  return products.filter((product) => {
    return product.variants.nodes.some(variant => {
      const isSelected = selectedVariants[product.id] === variant.id;
      return variant.availableForSale && 
             !cartLineProductVariantIds.includes(variant.id) &&
             (product.variants.nodes.length === 1 || isSelected);
    });
  });
}