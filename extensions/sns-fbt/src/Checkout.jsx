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
} from "@shopify/ui-extensions-react/checkout";

// Set up the entry point for the extension
export default reactExtension("purchase.checkout.block.render", () => <App />)

// Default collection ID to use if metafield is not found
const DEFAULT_COLLECTION_ID = "gid://shopify/Collection/280595365966"

function App() {
  const { query, i18n } = useApi()
  const applyCartLinesChange = useApplyCartLinesChange()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState({})
  const [showError, setShowError] = useState(false)
  const lines = useCartLines()

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [showError])

  async function handleAddToCart(variantId) {
    setAdding((prev) => ({ ...prev, [variantId]: true }))
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    })
    setAdding((prev) => ({ ...prev, [variantId]: false }))
    if (result.type === "error") {
      setShowError(true)
      console.error(result.message)
    }
  }

  async function fetchProducts() {
    setLoading(true)
    try {
      // Try multiple metafield keys to be flexible
      const { data: metafieldData } = await query(
        `query {
          pages(first: 1, query: "handle:global-cart-data") {
            nodes {
              id
              metafields(first: 10) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
        }`,
      )

      console.log("Metafield data:", JSON.stringify(metafieldData, null, 2))

      // Extract all metafields to check what's available
      const metafields = metafieldData?.pages?.nodes[0]?.metafields?.edges || []
      console.log(
        "Available metafields:",
        metafields.map((edge) => `${edge.node.namespace}.${edge.node.key}`),
      )

      // Try to find the collection ID from any relevant metafield
      let collectionId = null

      // Look for any metafield that might contain our collection ID
      for (const edge of metafields) {
        const { namespace, key, value } = edge.node
        if (
          (namespace === "custom" && (key === "upsell_products" || key === "checkout_upsell")) ||
          key.includes("upsell") ||
          key.includes("collection")
        ) {
          console.log(`Found potential metafield: ${namespace}.${key} with value: ${value}`)
          collectionId = value
          break
        }
      }

      // If no metafield found, use the default collection ID
      if (!collectionId) {
        console.log("No collection ID found in metafields, using default:", DEFAULT_COLLECTION_ID)
        collectionId = DEFAULT_COLLECTION_ID
      }

      // Format the collection ID if needed
      if (!collectionId.startsWith("gid://")) {
        collectionId = `gid://shopify/Collection/${collectionId}`
      }

      console.log("Using collection ID:", collectionId)

      // Now fetch products from the specified collection - MODIFIED to include inventory information
      const { data } = await query(
        `query ($collectionId: ID!, $first: Int!) {
          collection(id: $collectionId) {
            title
            products(first: $first) {
              nodes {
                id
                title
                availableForSale
                images(first: 1) {
                  nodes {
                    url
                  }
                }
                variants(first: 5) {
                  nodes {
                    id
                    price {
                      amount
                    }
                    quantityAvailable
                    availableForSale
                  }
                }
              }
            }
          }
        }`,
        {
          variables: {
            collectionId: collectionId,
            first: 20, // Fetch more to ensure we have enough after filtering
          },
        },
      )

      console.log("Collection title:", data?.collection?.title)
      console.log("Products found:", data?.collection?.products?.nodes?.length || 0)

      // Filter products to only include those with available inventory
      const availableProducts = data?.collection?.products?.nodes.filter(product => {
        // Check if at least one variant has quantity available
        return product.variants.nodes.some(variant => 
          variant.availableForSale && 
          (variant.quantityAvailable === null || variant.quantityAvailable > 0)
        );
      }) || [];

      console.log("Available products:", availableProducts.length);
      setProducts(availableProducts);
    } catch (error) {
      console.error("Error fetching products:", error)

      // Fallback to fetching products without a collection
      try {
        console.log("Attempting fallback to fetch products without collection")
        const { data } = await query(
          `query {
            products(first: 20) {
              nodes {
                id
                title
                availableForSale
                images(first: 1) {
                  nodes {
                    url
                  }
                }
                variants(first: 5) {
                  nodes {
                    id
                    price {
                      amount
                    }
                    quantityAvailable
                    availableForSale
                  }
                }
              }
            }
          }`,
        )

        console.log("Fallback products found:", data?.products?.nodes?.length || 0)
        
        // Filter products to only include those with available inventory
        const availableProducts = data?.products?.nodes.filter(product => {
          // Check if at least one variant has quantity available
          return product.variants.nodes.some(variant => 
            variant.availableForSale && 
            (variant.quantityAvailable === null || variant.quantityAvailable > 0)
          );
        }) || [];

        console.log("Available fallback products:", availableProducts.length);
        setProducts(availableProducts);
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingSkeleton count={3} />
  }

  if (!loading && products.length === 0) {
    return null
  }

  const productsOnOffer = getProductsOnOffer(lines, products)

  if (!productsOnOffer.length) {
    return null
  }

  // Display up to 3 products (or all available if less than 3)
  const productsToShow = productsOnOffer.slice(0, 3)

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        {productsToShow.map((product) => {
          // Find the first available variant to display
          const availableVariant = product.variants.nodes.find(variant => 
            variant.availableForSale && 
            (variant.quantityAvailable === null || variant.quantityAvailable > 0)
          );
          
          if (!availableVariant) return null;
          
          return (
            <ProductOffer
              key={product.id}
              product={{
                ...product,
                variants: { nodes: [availableVariant] }
              }}
              i18n={i18n}
              adding={adding[availableVariant.id] || false}
              handleAddToCart={handleAddToCart}
              showError={showError}
            />
          );
        })}
      </BlockStack>
      {showError && <ErrorBanner />}
    </BlockStack>
  )
}

function LoadingSkeleton({ count = 3 }) {
  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        {[...Array(count)].map((_, index) => (
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
  )
}

function getProductsOnOffer(lines, products) {
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id)
  return products.filter((product) => {
    const isProductVariantInCart = product.variants.nodes.some(({ id }) => cartLineProductVariantIds.includes(id))
    return !isProductVariantInCart
  })
}

function ProductOffer({ product, i18n, adding, handleAddToCart, showError }) {
  const { images, title, variants } = product
  const renderPrice = i18n.formatCurrency(variants.nodes[0].price.amount)
  const imageUrl =
    images.nodes[0]?.url ??
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081"

  return (
    <InlineLayout spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
      <Image
        border="base"
        borderWidth="base"
        borderRadius="loose"
        source={imageUrl}
        accessibilityDescription={title}
        aspectRatio={1}
      />
      <BlockStack spacing="none">
        <Text size="medium" emphasis="bold">
          {title}
        </Text>
        <Text appearance="subdued">{renderPrice}</Text>
      </BlockStack>
      <Button
        kind="secondary"
        loading={adding}
        accessibilityLabel={`Add ${title} to cart`}
        onPress={() => handleAddToCart(variants.nodes[0].id)}
      >
        Add
      </Button>
    </InlineLayout>
  )
}

function ErrorBanner() {
  return <Banner status="critical">There was an issue adding this product. Please try again.</Banner>
}